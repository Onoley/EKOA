"use server";

import { requireActiveProfile } from "@/features/auth/authorization";
import { resultsSchema, toggleInputSchema, voteInputSchema, type ResultRow } from "./schema";
import { consumeRateLimit } from "@/lib/rate-limit/rate-limit";
import { logOperational, sendOperationalAlert } from "@/lib/observability/logger";

export type VoteState = { status: "idle" | "success" | "error"; message: string; results?: ResultRow[] };
export type ToggleState = { status: "idle" | "success" | "error"; message: string; enabled: boolean; count?: number };

const voteErrors: Record<string, string> = {
  vote_immutable: "Votre vote est définitif et ne peut pas être modifié.", question_unavailable: "Cette question n’est plus disponible.",
  invalid_option: "Cette réponse n’est pas disponible.", age_ineligible: "Cette question ne correspond pas à votre tranche d’âge.",
};

export async function submitVote(_state: VoteState, formData: FormData): Promise<VoteState> {
  const parsed = voteInputSchema.safeParse({ questionId: formData.get("questionId"), optionId: formData.get("optionId") });
  if (!parsed.success) return { status: "error", message: "Le vote envoyé est invalide." };
  const { supabase, userId } = await requireActiveProfile();
  try {
    if (!(await consumeRateLimit("vote", userId))) {
      await sendOperationalAlert("rate_limit.denied", { scope: "vote", status: 429 });
      return { status: "error", message: "Trop de votes rapprochés. Patientez un instant." };
    }
  } catch { return { status: "error", message: "Le vote est momentanément indisponible." }; }
  const { data, error } = await supabase.rpc("submit_vote", { requested_question_id: parsed.data.questionId, requested_option_id: parsed.data.optionId });
  if (error) { logOperational("warn", "vote.error", { code: error.code || "database_rejected" }); const key = Object.keys(voteErrors).find((candidate) => error.message.includes(candidate)); return { status: "error", message: key ? voteErrors[key] : "Le vote n’a pas pu être enregistré." }; }
  const results = resultsSchema.safeParse(data);
  if (!results.success) return { status: "error", message: "Les résultats reçus sont invalides." };
  return { status: "success", message: "Votre réponse est enregistrée.", results: results.data };
}

export async function toggleFollow(_state: ToggleState, formData: FormData): Promise<ToggleState> {
  const parsed = toggleInputSchema.safeParse({ questionId: formData.get("questionId"), enabled: formData.get("enabled") === "true" });
  if (!parsed.success) return { ..._state, status: "error", message: "Action invalide." };
  const { supabase } = await requireActiveProfile();
  const { data, error } = await supabase.rpc("set_question_follow", { requested_question_id: parsed.data.questionId, requested_followed: parsed.data.enabled });
  if (error || typeof data !== "boolean") return { ..._state, status: "error", message: "Le suivi n’a pas pu être modifié." };
  return { status: "success", message: data ? "Question suivie." : "Question retirée des suivis.", enabled: data };
}

export async function toggleUpvote(_state: ToggleState, formData: FormData): Promise<ToggleState> {
  const parsed = toggleInputSchema.safeParse({ questionId: formData.get("questionId"), enabled: formData.get("enabled") === "true" });
  if (!parsed.success) return { ..._state, status: "error", message: "Action invalide." };
  const { supabase } = await requireActiveProfile();
  const { data, error } = await supabase.rpc("set_question_upvote", { requested_question_id: parsed.data.questionId, requested_upvoted: parsed.data.enabled });
  if (error) {
    logOperational("warn", "vote.error", { scope: "question_upvote", code: error.code || "database_rejected" });
    const message = error.message.includes("question_unavailable")
      ? "Cette question n’est plus disponible. Actualisez la page."
      : error.message.includes("not_authorized")
        ? "Votre session a expiré. Reconnectez-vous."
        : "L’upvote n’a pas pu être enregistré. Réessayez.";
    return { ..._state, status: "error", message };
  }
  const row = Array.isArray(data) ? data[0] as { is_upvoted?: unknown; upvote_count?: unknown } | undefined : undefined;
  const count = typeof row?.upvote_count === "number" ? row.upvote_count : Number(row?.upvote_count);
  if (typeof row?.is_upvoted !== "boolean" || !Number.isSafeInteger(count) || count < 0) {
    logOperational("warn", "vote.error", { scope: "question_upvote", code: "invalid_response" });
    return { ..._state, status: "error", message: "La réponse de l’upvote est invalide. Actualisez la page." };
  }
  return { status: "success", message: row.is_upvoted ? "Upvote enregistré." : "Upvote retiré.", enabled: row.is_upvoted, count };
}
