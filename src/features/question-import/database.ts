import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import type { EditorialIdentity, TaxonomyReference, ValidationContext, ValidatedQuestion } from "./types";

type DatabaseClient = SupabaseClient;

function configuredClient(): DatabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !secret) throw new Error("Configuration Supabase serveur manquante.");
  return createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });
}

async function allRows<T>(queryPage: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const rows: T[] = [];
  const pageSize = 500;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await queryPage(from, from + pageSize - 1);
    if (error) throw new Error(error.message);
    rows.push(...(data ?? []));
    if ((data?.length ?? 0) < pageSize) return rows;
  }
}

export async function loadValidationContext(db: DatabaseClient = configuredClient()): Promise<ValidationContext> {
  const existingQuestionsPromise = allRows<{ external_id: string | null; source_content_hash: string | null; normalized_text: string }>((from, to) =>
    db.from("questions").select("external_id,source_content_hash,normalized_text").range(from, to) as never)
    .catch(async (error: unknown) => {
      if (!(error instanceof Error) || !error.message.includes("external_id")) throw error;
      const legacyRows = await allRows<{ normalized_text: string }>((from, to) =>
        db.from("questions").select("normalized_text").range(from, to) as never);
      return legacyRows.map((item) => ({ external_id: null, source_content_hash: null, normalized_text: item.normalized_text }));
    });
  const [universeResult, categoryResult, tagResult, relationResult, existingQuestions, forbiddenResult, settingsResult] = await Promise.all([
    db.from("universes").select("id,slug").eq("is_active", true),
    db.from("categories").select("id,slug,universe_id").eq("is_active", true),
    db.from("tags").select("id,slug,is_active"),
    db.from("category_tags").select("category_id,tag_id"),
    existingQuestionsPromise,
    db.from("question_forbidden_terms").select("term").eq("is_active", true),
    db.from("question_settings").select("question_max_length,option_max_length").eq("singleton", true).single(),
  ]);
  for (const result of [universeResult, categoryResult, tagResult, relationResult, forbiddenResult, settingsResult]) {
    if (result.error) throw new Error(result.error.message);
  }
  const universeIdToSlug = new Map((universeResult.data ?? []).map((item) => [item.id, item.slug]));
  const taxonomy: TaxonomyReference = {
    universes: new Map((universeResult.data ?? []).map((item) => [item.slug, { id: item.id }])),
    categories: new Map((categoryResult.data ?? []).map((item) => [item.slug, { id: item.id, universeSlug: universeIdToSlug.get(item.universe_id) ?? "" }])),
    tags: new Map((tagResult.data ?? []).map((item) => [item.slug, { id: item.id, active: item.is_active }])),
    categoryTags: new Set((relationResult.data ?? []).map((item) => `${item.category_id}:${item.tag_id}`)),
  };
  return {
    taxonomy,
    existingQuestions: existingQuestions.map((item) => ({ externalId: item.external_id, contentHash: item.source_content_hash, normalizedText: item.normalized_text })),
    forbiddenTerms: (forbiddenResult.data ?? []).map((item) => item.term),
    questionMaxLength: settingsResult.data?.question_max_length ?? 180,
    optionMaxLength: settingsResult.data?.option_max_length ?? 80,
  };
}

export async function resolveEditorialIdentity(db: DatabaseClient = configuredClient()): Promise<EditorialIdentity> {
  const configuredAccount = process.env.EKOA_EDITORIAL_ACCOUNT_ID?.trim();
  const configuredOrganisation = process.env.EKOA_EDITORIAL_ORGANISATION_ID?.trim();
  if (Boolean(configuredAccount) === Boolean(configuredOrganisation)) {
    throw new Error("Configurez exactement une variable parmi EKOA_EDITORIAL_ACCOUNT_ID et EKOA_EDITORIAL_ORGANISATION_ID.");
  }
  let authorId = configuredAccount ?? "";
  if (configuredOrganisation) {
    const organisation = await db.from("sponsor_organisations").select("owner_user_id").eq("id", configuredOrganisation).maybeSingle();
    if (organisation.error || !organisation.data) throw new Error("Organisation éditoriale introuvable.");
    authorId = organisation.data.owner_user_id;
  }
  const profile = await db.from("profiles").select("user_id,account_status").eq("user_id", authorId).maybeSingle();
  if (profile.error || !profile.data || profile.data.account_status !== "active") throw new Error("Compte éditorial inexistant ou inactif.");
  return { authorId, organisationId: configuredOrganisation ?? null };
}

export type ImportOutcome = { outcome: "imported" | "skipped"; question_id: string };
export type QuestionImporter = (question: ValidatedQuestion, identity: EditorialIdentity, batchId: string) => Promise<ImportOutcome>;

export function createQuestionImporter(db: DatabaseClient = configuredClient()): QuestionImporter {
  return async (question, identity, batchId) => {
    const result = await db.rpc("import_editorial_question", {
      requested_external_id: question.externalId,
      requested_content_hash: question.contentHash,
      requested_author_id: identity.authorId,
      requested_organisation_id: identity.organisationId,
      requested_category_id: question.categoryId,
      requested_text: question.question,
      requested_options: question.options,
      requested_tag_ids: question.tagIds,
      requested_min_age: question.minimumAge,
      requested_max_age: question.maximumAge,
      requested_sensitivity: question.sensitivity,
      requested_editorial_type: question.editorialType,
      requested_question_format: question.questionFormat,
      requested_publication_priority: question.publicationPriority,
      requested_status: question.status,
      requested_editorial_note: question.editorialNote,
      requested_batch_id: batchId,
    });
    if (result.error) throw new Error(`Ligne ${question.row}, ${question.externalId} : ${result.error.message}`);
    return result.data as ImportOutcome;
  };
}

export async function getImportCheckData(db: DatabaseClient = configuredClient()) {
  const [questions, options, questionTags, categories] = await Promise.all([
    allRows<Record<string, unknown>>((from, to) => db.from("questions").select("id,external_id,category_id,normalized_text").not("external_id", "is", null).range(from, to) as never),
    allRows<{ question_id: string; normalized_text: string }>((from, to) => db.from("question_options").select("question_id,normalized_text").range(from, to) as never),
    allRows<{ question_id: string; tag_id: string }>((from, to) => db.from("question_tags").select("question_id,tag_id").range(from, to) as never),
    db.from("categories").select("id,slug"),
  ]);
  if (categories.error) throw new Error(categories.error.message);
  return { questions, options, questionTags, categories: categories.data ?? [] };
}

export { configuredClient };
