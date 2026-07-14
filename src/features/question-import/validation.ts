import { createHash } from "node:crypto";

import {
  SENSITIVITIES, type ImportIssue, type ImportLineStatus, type RawQuestionRow,
  type Sensitivity, type ValidatedQuestion, type ValidationContext, type ValidationResult,
} from "./types";
import { rawQuestionRowSchema } from "./schema";
import { convertImportStatus, parseQuestionFormat } from "./compatibility";

const externalIdPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const contactPatterns = [
  { code: "url_forbidden", regex: /(?:https?:\/\/|www\.)\S+/iu, label: "URL" },
  { code: "email_forbidden", regex: /[\w.%+-]+@[\w.-]+\.[A-Za-z]{2,}/u, label: "adresse e-mail" },
  { code: "phone_forbidden", regex: /(?:\+33|0)[1-9](?:[ .-]?\d{2}){4}/u, label: "numéro de téléphone" },
  { code: "personal_handle_forbidden", regex: /(?:^|\s)@[A-Za-z0-9_]{2,}/u, label: "identifiant personnel" },
];

export function normalizeText(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("fr-FR")
    .replace(/[’']/g, " ").replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
}

function contentHash(value: Omit<ValidatedQuestion, "row" | "contentHash" | "categoryId" | "tagIds" | "outcome">): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function optionalInteger(value: string): number | null | undefined {
  if (!value) return null;
  if (!/^-?\d+$/.test(value)) return undefined;
  return Number(value);
}

function issue(row: number, code: string, message: string, field?: string): ImportIssue {
  return { row, field, code, message };
}

export function validateQuestionRows(rows: RawQuestionRow[], context: ValidationContext): ValidationResult {
  const errors: ImportIssue[] = [];
  const warnings: ImportIssue[] = [];
  const questions: ValidatedQuestion[] = [];
  const seenExternalIds = new Set<string>();
  const seenTexts = new Set<string>();
  const existingByExternalId = new Map(context.existingQuestions.filter((item) => item.externalId).map((item) => [item.externalId as string, item]));
  const existingTexts = new Set(context.existingQuestions.map((item) => item.normalizedText));
  let duplicates = 0;
  let conflicts = 0;
  const conversions: ValidationResult["conversions"] = [];

  rows.forEach((raw, index) => {
    const row = index + 2;
    const rowErrors: ImportIssue[] = [];
    const parsed = rawQuestionRowSchema.safeParse(raw);
    if (!parsed.success) {
      errors.push(issue(row, "row_schema_invalid", "La ligne contient une cellule trop longue ou un format inattendu."));
      return;
    }
    const externalId = raw.external_id.trim();
    if (!externalId) rowErrors.push(issue(row, "external_id_required", "external_id est obligatoire.", "external_id"));
    else if (!externalIdPattern.test(externalId)) rowErrors.push(issue(row, "external_id_invalid", "external_id a un format invalide.", "external_id"));
    else if (seenExternalIds.has(externalId)) rowErrors.push(issue(row, "external_id_duplicate", "external_id est dupliqué dans le fichier.", "external_id"));
    if (externalId) seenExternalIds.add(externalId);

    const universe = context.taxonomy.universes.get(raw.universe_slug);
    const category = context.taxonomy.categories.get(raw.category_slug);
    if (!universe) rowErrors.push(issue(row, "universe_unknown", "Univers inconnu.", "universe_slug"));
    if (!category) rowErrors.push(issue(row, "category_unknown", "Catégorie inconnue.", "category_slug"));
    else if (category.universeSlug !== raw.universe_slug) rowErrors.push(issue(row, "universe_category_mismatch", "La catégorie n’appartient pas à cet univers.", "category_slug"));

    const question = raw.question.trim();
    const normalizedQuestion = normalizeText(question);
    if (question.length < 10 || question.length > context.questionMaxLength) rowErrors.push(issue(row, "question_length", `La question doit contenir entre 10 et ${context.questionMaxLength} caractères.`, "question"));

    const optionValues = [raw.option_1, raw.option_2, raw.option_3, raw.option_4, raw.option_5, raw.option_6].map((value) => value.trim());
    const firstHole = optionValues.findIndex((value) => !value);
    if (firstHole >= 0 && optionValues.slice(firstHole + 1).some(Boolean)) rowErrors.push(issue(row, "option_gap", "Les options doivent être renseignées sans trou.", `option_${firstHole + 1}`));
    const options = optionValues.filter(Boolean);
    if (options.length < 2 || options.length > 6) rowErrors.push(issue(row, "option_count", "Deux à six options sont obligatoires.", "option_1"));
    if (options.some((value) => value.length > context.optionMaxLength)) rowErrors.push(issue(row, "option_length", `Une option dépasse ${context.optionMaxLength} caractères.`, "option_1"));
    if (new Set(options.map(normalizeText)).size !== options.length) rowErrors.push(issue(row, "option_duplicate", "Une option est dupliquée.", "option_1"));

    const tagSlugs = [raw.tag_1, raw.tag_2, raw.tag_3].map((value) => value.trim()).filter(Boolean);
    if (new Set(tagSlugs).size !== tagSlugs.length) rowErrors.push(issue(row, "tag_duplicate", "Un tag est dupliqué.", "tag_1"));
    for (const tagSlug of tagSlugs) {
      const tag = context.taxonomy.tags.get(tagSlug);
      if (!tag?.active) rowErrors.push(issue(row, "tag_unknown", `Tag inconnu ou inactif : ${tagSlug}.`, "tag_1"));
      else if (category && !context.taxonomy.categoryTags.has(`${category.id}:${tag.id}`)) warnings.push(issue(row, "tag_category_unrecommended", `Le tag ${tagSlug} est actif mais pas encore recommandé pour cette catégorie.`, "tag_1"));
    }

    const minimumAge = optionalInteger(raw.minimum_age);
    const maximumAge = optionalInteger(raw.maximum_age);
    if (minimumAge === undefined || (minimumAge !== null && (minimumAge < 18 || minimumAge > 120))) rowErrors.push(issue(row, "minimum_age_invalid", "L’âge minimum doit être compris entre 18 et 120.", "minimum_age"));
    if (maximumAge === undefined || (maximumAge !== null && (maximumAge < 18 || maximumAge > 120))) rowErrors.push(issue(row, "maximum_age_invalid", "L’âge maximum doit être compris entre 18 et 120.", "maximum_age"));
    if (minimumAge !== undefined && maximumAge !== undefined && minimumAge !== null && maximumAge !== null && minimumAge > maximumAge) rowErrors.push(issue(row, "age_range_invalid", "L’âge minimum dépasse l’âge maximum.", "minimum_age"));

    if (!SENSITIVITIES.includes(raw.sensitivity as Sensitivity)) rowErrors.push(issue(row, "sensitivity_invalid", "Sensibilité invalide.", "sensitivity"));
    const questionFormat = parseQuestionFormat(raw.editorial_type);
    const statusConversion = convertImportStatus(raw.status);
    if (!questionFormat) rowErrors.push(issue(row, "question_format_invalid", "Format de question invalide.", "editorial_type"));
    if (!statusConversion) rowErrors.push(issue(row, "status_invalid", "Statut éditorial invalide : ready, review ou rejected attendu.", "status"));
    const priority = optionalInteger(raw.publication_priority);
    if (priority === undefined || priority === null || priority < 0 || priority > 100) rowErrors.push(issue(row, "priority_invalid", "La priorité doit être un entier entre 0 et 100.", "publication_priority"));
    if (raw.editorial_note.length > 2000) rowErrors.push(issue(row, "editorial_note_length", "La note éditoriale dépasse 2 000 caractères.", "editorial_note"));

    for (const [field, value] of [["question", question], ...options.map((value, optionIndex) => [`option_${optionIndex + 1}`, value])] as Array<[string, string]>) {
      for (const pattern of contactPatterns) if (pattern.regex.test(value)) rowErrors.push(issue(row, pattern.code, `${pattern.label} interdite dans ${field}.`, field));
      const normalized = normalizeText(value);
      if (context.forbiddenTerms.some((term) => normalized.includes(normalizeText(term)))) rowErrors.push(issue(row, "forbidden_content", `Contenu interdit dans ${field}.`, field));
    }

    if (normalizedQuestion && seenTexts.has(normalizedQuestion)) {
      duplicates += 1;
      rowErrors.push(issue(row, "question_duplicate", "Question identique déjà présente dans le fichier ou en base.", "question"));
    }
    if (normalizedQuestion) seenTexts.add(normalizedQuestion);

    if (rowErrors.length) {
      errors.push(...rowErrors);
      return;
    }

    const base = {
      externalId, universeSlug: raw.universe_slug, categorySlug: raw.category_slug,
      question, normalizedQuestion, options, tagSlugs,
      minimumAge: minimumAge ?? null, maximumAge: maximumAge ?? null,
      sensitivity: raw.sensitivity as Sensitivity,
      editorialType: "evergreen" as const, questionFormat: questionFormat!, importLineStatus: raw.status as ImportLineStatus,
      publicationPriority: priority as number, status: statusConversion?.status ?? "draft",
      editorialNote: raw.editorial_note.trim(),
    };
    const hash = contentHash(base);
    const existing = existingByExternalId.get(externalId);
    if (existing && existing.contentHash !== hash) {
      conflicts += 1;
      errors.push(issue(row, "external_id_conflict", "external_id existe avec un contenu différent.", "external_id"));
      return;
    }
    if (!existing && existingTexts.has(normalizedQuestion)) {
      duplicates += 1;
      errors.push(issue(row, "question_duplicate", "Question identique déjà présente en base avec un autre identifiant.", "question"));
      return;
    }
    if (existing) warnings.push(issue(row, "already_imported", "Ligne déjà importée à l’identique : elle sera ignorée.", "external_id"));
    const outcome = statusConversion?.action === "ignore" ? "rejected" : existing ? "skip" : "import";
    conversions.push({ row, sourceStatus: raw.status as ImportLineStatus, internalStatus: statusConversion?.status ?? null, questionFormat: questionFormat! });
    if (outcome === "rejected") warnings.push(issue(row, "line_rejected", "Ligne marquée rejected : elle sera ignorée.", "status"));
    questions.push({ row, ...base, contentHash: hash, categoryId: category?.id ?? "", tagIds: tagSlugs.map((slug) => context.taxonomy.tags.get(slug)?.id ?? ""), outcome });
  });

  return { totalRows: rows.length, questions, errors, warnings, duplicates, conflicts, conversions };
}
