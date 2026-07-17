"use server";

import { redirect } from "next/navigation";
import { requireActiveProfile } from "@/features/auth/authorization";
import { parseQuestionForm } from "./schema";
import { logOperational } from "@/lib/observability/logger";

export type QuestionActionState = {
  status: "idle" | "error" | "draft";
  message: string;
  draftId?: string;
  fieldErrors?: Record<string, string[]>;
};

const dbMessages: Record<string, string> = {
  invalid_question: "La question ne respecte pas la longueur ou le nombre de réponses attendu.",
  invalid_options: "Une ou plusieurs réponses sont invalides.",
  duplicate_options: "Chaque réponse proposée doit être différente.",
  invalid_age_range: "La tranche d’âge sélectionnée est invalide.",
  invalid_category: "Cette catégorie n’est plus disponible. Choisissez-en une autre.",
  invalid_tags: "Un tag ne correspond pas à la catégorie sélectionnée.",
  draft_unavailable: "Ce brouillon n’est plus disponible.",
  wave_unavailable: "La question précédente choisie n’est plus disponible.",
  not_authorized: "Votre session n’est plus valide. Reconnectez-vous puis réessayez.",
};

function databaseMessage(message: string, fallback: string) {
  const key = Object.keys(dbMessages).find((candidate) => message.includes(candidate));
  return key ? dbMessages[key] : fallback;
}

export async function saveOrPublishQuestion(_state: QuestionActionState, formData: FormData): Promise<QuestionActionState> {
  const parsed = parseQuestionForm(formData);
  if (!parsed.success) return { status: "error", message: "Vérifiez votre question.", fieldErrors: parsed.error.flatten().fieldErrors };
  const { supabase } = await requireActiveProfile();
  const value = parsed.data;
  const { data: draftId, error: saveError } = await supabase.rpc("save_question_draft", {
    requested_question_id: value.questionId, requested_text: value.text, requested_category_id: value.categoryId,
    requested_options: value.options, requested_tags: value.tags, requested_min_age: value.minAge,
    requested_max_age: value.maxAge, requested_previous_wave_id: value.previousWaveId,
  });
  if (saveError || typeof draftId !== "string") {
    logOperational("warn", "publication.error", { code: saveError?.code || "draft_save_failed" });
    return {
      status: "error",
      message: databaseMessage(saveError?.message ?? "", "La question n’a pas pu être enregistrée."),
    };
  }
  if (formData.get("intent") === "draft") return { status: "draft", message: "Brouillon enregistré.", draftId };

  const { error: publishError } = await supabase.rpc("publish_question", {
    requested_question_id: draftId,
    confirmed_medium_similarity: false,
  });
  if (publishError) {
    logOperational("warn", "publication.error", { code: publishError.code || "database_rejected" });
    return {
      status: "error",
      message: databaseMessage(publishError.message, "La publication a échoué."),
      draftId,
    };
  }
  redirect(`/creer/confirmation?id=${draftId}`);
}
