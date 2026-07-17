"use server";

import { redirect } from "next/navigation";
import { requireActiveProfile } from "@/features/auth/authorization";
import { parseQuestionForm } from "./schema";
import { consumeRateLimit } from "@/lib/rate-limit/rate-limit";
import { logOperational } from "@/lib/observability/logger";

export type SimilarQuestion = { question_id: string; question_text: string; category_name: string; similarity: number; is_exact: boolean };
export type QuestionActionState = { status: "idle" | "error" | "draft" | "similar"; message: string; draftId?: string; fieldErrors?: Record<string, string[]>; similar?: SimilarQuestion[]; duplicateBlocked?: boolean };

const dbMessages: Record<string, string> = {
  active_limit: "Vous avez atteint la limite de dix questions actives.", rolling_limit: "Vous avez déjà publié trois questions sur les sept derniers jours.",
  rate_limit: "Trop de publications ont été effectuées récemment. Réessayez plus tard.", exact_duplicate: "Cette question existe déjà.",
  high_similarity: "Cette question est trop proche d’une question existante.", similarity_confirmation_required: "Confirmez que votre question apporte quelque chose de distinct.",
  contact_details: "Les liens et coordonnées ne sont pas autorisés.",
  forbidden_content: "Ce contenu ne respecte pas les règles de publication.",
  invalid_question: "La question ne respecte pas la longueur ou le nombre de réponses attendu.",
  invalid_options: "Une ou plusieurs réponses sont invalides.",
  duplicate_options: "Chaque réponse proposée doit être différente.",
  invalid_age_range: "La tranche d’âge sélectionnée est invalide.",
  invalid_category: "Cette catégorie n’est plus disponible. Choisissez-en une autre.",
  wave_unavailable: "La question précédente choisie n’est plus disponible.",
  not_authorized: "Votre session n’est plus valide. Reconnectez-vous puis réessayez.",
};

export async function saveOrPublishQuestion(_state: QuestionActionState, formData: FormData): Promise<QuestionActionState> {
  const parsed = parseQuestionForm(formData);
  if (!parsed.success) return { status: "error", message: "Vérifiez votre question.", fieldErrors: parsed.error.flatten().fieldErrors };
  const { supabase, userId } = await requireActiveProfile();
  const value = parsed.data;
  const { data: draftId, error: saveError } = await supabase.rpc("save_question_draft", {
    requested_question_id: value.questionId, requested_text: value.text, requested_category_id: value.categoryId,
    requested_options: value.options, requested_tags: value.tags, requested_min_age: value.minAge,
    requested_max_age: value.maxAge, requested_previous_wave_id: value.previousWaveId,
  });
  if (saveError || typeof draftId !== "string") return { status: "error", message: "Le brouillon n’a pas pu être enregistré." };
  if (formData.get("intent") === "draft") return { status: "draft", message: "Brouillon enregistré.", draftId };
  try {
    if (!(await consumeRateLimit("publication", userId))) {
      logOperational("warn", "rate_limit.denied", { scope: "publication", status: 429 });
      return { status: "error", message: "Trop de tentatives de publication. Réessayez plus tard.", draftId };
    }
  } catch { return { status: "error", message: "La publication est momentanément indisponible.", draftId }; }

  const { data: candidates, error: similarError } = await supabase.rpc("find_similar_questions", {
    requested_text: value.text, requested_category_id: value.categoryId, requested_options: value.options, excluded_question_id: draftId,
  });
  if (similarError) return { status: "error", message: "La recherche de questions similaires a échoué.", draftId };
  const similar = (Array.isArray(candidates) ? candidates : []) as SimilarQuestion[];
  const confirmed = formData.get("confirmDistinct") === "yes";
  const { error: publishError } = await supabase.rpc("publish_question", { requested_question_id: draftId, confirmed_medium_similarity: confirmed });
  if (publishError) {
    logOperational("warn", "publication.error", { code: publishError.code||"database_rejected" });
    const key = Object.keys(dbMessages).find((candidate) => publishError.message.includes(candidate));
    if (key === "exact_duplicate" || key === "high_similarity" || key === "similarity_confirmation_required") {
      return { status: "similar", message: dbMessages[key], draftId, similar, duplicateBlocked: key !== "similarity_confirmation_required" };
    }
    return { status: "error", message: key ? dbMessages[key] : "La publication a échoué.", draftId, similar };
  }
  redirect(`/creer/confirmation?id=${draftId}`);
}
