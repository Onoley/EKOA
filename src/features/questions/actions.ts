"use server";

import { redirect } from "next/navigation";
import { requireActiveProfile } from "@/features/auth/authorization";
import { parseQuestionForm } from "./schema";
import { consumeRateLimit } from "@/lib/rate-limit/rate-limit";
import { logOperational } from "@/lib/observability/logger";
import { createAdminClient } from "@/lib/supabase/admin";
import { analyzeQuestionSubmission } from "@/features/moderation/actions";

export type SimilarQuestion = { question_id: string; question_text: string; category_name: string; similarity: number; is_exact: boolean };
export type QuestionActionState = { status: "idle" | "error" | "draft" | "similar"; message: string; draftId?: string; fieldErrors?: Record<string, string[]>; similar?: SimilarQuestion[]; duplicateBlocked?: boolean };

const dbMessages: Record<string, string> = {
  active_limit: "Vous avez atteint la limite de dix questions actives.", rolling_limit: "Vous avez déjà publié trois questions sur les sept derniers jours.",
  rate_limit: "Trop de publications ont été effectuées récemment. Réessayez plus tard.", exact_duplicate: "Cette question existe déjà.",
  high_similarity: "Cette question est trop proche d’une question existante.", similarity_confirmation_required: "Confirmez que votre question apporte quelque chose de distinct.",
  contact_details: "Les liens et coordonnées ne sont pas autorisés.",
  forbidden_content: "Ce contenu ne respecte pas les règles de publication.",
  QUESTION_REVIEW_ALREADY_PENDING: "Une question est déjà en cours de vérification. Vous pourrez en proposer une nouvelle lorsque la décision aura été rendue.",
};

export async function saveOrPublishQuestion(_state: QuestionActionState, formData: FormData): Promise<QuestionActionState> {
  const parsed = parseQuestionForm(formData);
  if (!parsed.success) return { status: "error", message: "Vérifiez votre question.", fieldErrors: parsed.error.flatten().fieldErrors };
  const { supabase, userId } = await requireActiveProfile();
  const value = parsed.data;
  if(formData.get("intent")==="draft")return{status:"error",message:"Les brouillons ne sont plus utilisés. Soumettez directement votre question à la vérification."};
  const{data:openReview,error:openReviewError}=await supabase.rpc("get_current_question_review_status");
  if(openReviewError)return{status:"error",message:"La vérification des questions en attente est momentanément indisponible."};
  if(Array.isArray(openReview)&&openReview.length)return{status:"error",message:dbMessages.QUESTION_REVIEW_ALREADY_PENDING};
  try {
    if (!(await consumeRateLimit("publication", userId))) {
      logOperational("warn", "rate_limit.denied", { scope: "publication", status: 429 });
      return { status: "error", message: "Trop de tentatives de publication. Réessayez plus tard." };
    }
  } catch { return { status: "error", message: "La publication est momentanément indisponible." }; }

  const { data: candidates, error: similarError } = await supabase.rpc("find_similar_questions", {
    requested_text: value.text, requested_category_id: value.categoryId, requested_options: value.options, excluded_question_id: null,
  });
  if (similarError) return { status: "error", message: "La recherche de questions similaires a échoué." };
  const similar = (Array.isArray(candidates) ? candidates : []) as SimilarQuestion[];
  const confirmed = formData.get("confirmDistinct") === "yes";
  const analysis=await analyzeQuestionSubmission(value.text,value.options);
  const{data:questionId,error:publishError}=await createAdminClient().rpc("submit_moderated_question",{requested_user_id:userId,requested_text:value.text,requested_category_id:value.categoryId,requested_options:value.options,requested_tags:value.tags,requested_min_age:value.minAge,requested_max_age:value.maxAge,requested_previous_wave_id:value.previousWaveId,requested_confirmed_medium_similarity:confirmed,requested_moderation:analysis});
  if (publishError) {
    logOperational("warn", "publication.error", { code: "database_rejected" });
    const key = Object.keys(dbMessages).find((candidate) => publishError.message.includes(candidate));
    if (key === "exact_duplicate" || key === "high_similarity" || key === "similarity_confirmation_required") {
      return { status: "similar", message: dbMessages[key], similar, duplicateBlocked: key !== "similarity_confirmation_required" };
    }
    return { status: "error", message: key ? dbMessages[key] : "La soumission a échoué.", similar };
  }
  if(typeof questionId!=="string")return{status:"error",message:"La soumission n’a pas pu être confirmée."};
  redirect(analysis.action==="ALLOW"?`/creer/confirmation?id=${questionId}`:"/profil");
}
