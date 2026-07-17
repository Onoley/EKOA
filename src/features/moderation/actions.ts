"use server";

import { revalidatePath } from "next/cache";
import { requireActiveProfile, requireAdmin, requireModerator } from "@/features/auth/authorization";
import { logOperational } from "@/lib/observability/logger";
import { consumeRateLimit } from "@/lib/rate-limit/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";
import { containsProhibitedContactDetails } from "@/features/questions/schema";
import { automatedAdminDecisionSchema, directQuestionActionSchema, forbiddenTermSchema, moderationInputSchema, questionRevisionSchema, quickVerificationSchema, suspensionSchema, verificationSchema, type AutomatedModerationHistoryItem, type AutomatedModerationQueueItem, type MyModeratedQuestion } from "./schema";
import { analyzeSubmissionContent, type SubmissionModerationAnalysis } from "./server/submission-analysis";

export type ModerationState = { status: "idle" | "success" | "error"; message: string };

async function adminLimit(userId: string): Promise<ModerationState | null> {
  try {
    if (await consumeRateLimit("admin", userId)) return null;
    logOperational("warn", "rate_limit.denied", { scope: "admin", status: 429 });
  } catch { logOperational("error", "admin.error", { code: "rate_limit_unavailable" }); }
  return { status: "error", message: "Trop d’actions rapprochées. Réessayez plus tard." };
}

export async function moderateReport(_state: ModerationState, formData: FormData): Promise<ModerationState> {
  const parsed = moderationInputSchema.safeParse({ reportId: formData.get("reportId"), action: formData.get("action"), reason: formData.get("reason") });
  if (!parsed.success) return { status: "error", message: parsed.error.issues[0]?.message ?? "Décision invalide." };
  const { supabase, userId } = await requireModerator();
  const limited = await adminLimit(userId); if (limited) return limited;
  const { error } = await supabase.rpc("moderate_report", { requested_report_id: parsed.data.reportId, requested_action: parsed.data.action, requested_reason: parsed.data.reason });
  if (error) { logOperational("error", "admin.error", { code: "moderation_failed" }); return { status: "error", message: "La décision n’a pas pu être enregistrée." }; }
  revalidatePath("/admin"); return { status: "success", message: "Décision enregistrée et auditée." };
}

export async function setSuspension(_state: ModerationState, formData: FormData): Promise<ModerationState> {
  const parsed = suspensionSchema.safeParse({ userId: formData.get("userId"), suspended: formData.get("suspended") === "true", reason: formData.get("reason") });
  if (!parsed.success) return { status: "error", message: "Vérifiez la justification." };
  const { supabase, userId } = await requireAdmin(); const limited = await adminLimit(userId); if (limited) return limited;
  const { error } = await supabase.rpc("admin_set_account_suspension", { requested_user_id: parsed.data.userId, requested_suspended: parsed.data.suspended, requested_reason: parsed.data.reason });
  if (error) return { status: "error", message: "Le statut du compte n’a pas pu être modifié." };
  revalidatePath("/admin"); return { status: "success", message: parsed.data.suspended ? "Compte suspendu." : "Compte réactivé." };
}

export async function setVerification(_state: ModerationState, formData: FormData): Promise<ModerationState> {
  const parsed = verificationSchema.safeParse({ userId: formData.get("userId"), status: formData.get("status"), organisationType: formData.get("organisationType"), organisationName: formData.get("organisationName"), publicDescription: formData.get("publicDescription"), officialWebsite: formData.get("officialWebsite"), responsibleOwner: formData.get("responsibleOwner"), privateNotes: formData.get("privateNotes") });
  if (!parsed.success) return { status: "error", message: parsed.error.issues[0]?.message ?? "Données de vérification invalides." };
  const { supabase, userId } = await requireAdmin(); const limited = await adminLimit(userId); if (limited) return limited;
  const { error } = await supabase.rpc("admin_set_verification", { requested_user_id: parsed.data.userId, requested_status: parsed.data.status, requested_organisation_type: parsed.data.organisationType, requested_organisation_name: parsed.data.organisationName, requested_public_description: parsed.data.publicDescription, requested_official_website: parsed.data.officialWebsite, requested_responsible_owner: parsed.data.responsibleOwner, requested_private_notes: parsed.data.privateNotes });
  if (error) return { status: "error", message: "La vérification n’a pas pu être enregistrée." };
  revalidatePath("/admin"); return { status: "success", message: "Vérification enregistrée." };
}

export async function setForbiddenTerm(_state: ModerationState, formData: FormData): Promise<ModerationState> {
  const parsed = forbiddenTermSchema.safeParse({ term: formData.get("term"), severity: formData.get("severity"), active: formData.get("active") !== "false" });
  if (!parsed.success) return { status: "error", message: "Terme ou sévérité invalide." };
  const { supabase, userId } = await requireAdmin(); const limited = await adminLimit(userId); if (limited) return limited;
  const { error } = await supabase.rpc("admin_set_forbidden_term", { requested_term: parsed.data.term, requested_severity: parsed.data.severity, requested_active: parsed.data.active });
  if (error) return { status: "error", message: "Le terme n’a pas pu être enregistré." };
  revalidatePath("/admin"); return { status: "success", message: "Terme interdit enregistré." };
}

export async function moderateQuestionDirectly(_state: ModerationState, formData: FormData): Promise<ModerationState> {
  const parsed=directQuestionActionSchema.safeParse({questionId:formData.get("questionId"),action:formData.get("action"),reason:formData.get("reason")});
  if(!parsed.success)return{status:"error",message:parsed.error.issues[0]?.message??"Action invalide."};
  const{supabase,userId}=await requireAdmin();const limited=await adminLimit(userId);if(limited)return limited;
  const{error}=await supabase.rpc("admin_moderate_question",{requested_question_id:parsed.data.questionId,requested_action:parsed.data.action,requested_reason:parsed.data.reason});
  if(error)return{status:"error",message:"L’action sur la question a échoué."};
  revalidatePath("/admin");revalidatePath("/fil");revalidatePath(`/questions/${parsed.data.questionId}`);
  return{status:"success",message:parsed.data.action==="remove"?"Question retirée immédiatement.":parsed.data.action==="restore"?"Question restaurée.":parsed.data.action==="feature_24"?"Question mise en avant pendant 24 heures.":parsed.data.action==="feature_48"?"Question mise en avant pendant 48 heures.":"Mise en avant retirée."};
}

export async function setQuickVerification(_state: ModerationState,formData:FormData):Promise<ModerationState>{
  const parsed=quickVerificationSchema.safeParse({userId:formData.get("userId"),verified:formData.get("verified")==="true"});
  if(!parsed.success)return{status:"error",message:"Compte invalide."};
  const{supabase,userId}=await requireAdmin();const limited=await adminLimit(userId);if(limited)return limited;
  const{error}=await supabase.rpc("admin_set_quick_verification",{requested_user_id:parsed.data.userId,requested_verified:parsed.data.verified});
  if(error)return{status:"error",message:"La certification n’a pas pu être modifiée."};
  revalidatePath("/admin");revalidatePath("/profil");return{status:"success",message:parsed.data.verified?"Compte certifié immédiatement.":"Certification retirée."};
}

export async function analyzeQuestionSubmission(text:string,options:string[]):Promise<SubmissionModerationAnalysis>{
 return analyzeSubmissionContent(text,options);
}

export async function getCurrentQuestionReviewStatus(){const{supabase}=await requireActiveProfile();const{data,error}=await supabase.rpc("get_current_question_review_status");if(error)throw new Error("question_review_status_unavailable");return Array.isArray(data)?data[0]??null:data??null}
export async function getPendingModerationQueue(page=1,pageSize=25){const{supabase}=await requireAdmin();const safePage=Math.max(1,Math.trunc(page));const safeSize=Math.min(50,Math.max(1,Math.trunc(pageSize)));const{data,error}=await supabase.rpc("get_pending_automated_moderation_queue",{requested_limit:safeSize,requested_offset:(safePage-1)*safeSize});if(error)throw new Error("moderation_queue_unavailable");return data??[]}

export async function getAutomatedModerationDashboard(tab:"pending"|"rewrite"|"urgent"){
 const{supabase}=await requireAdmin();
 const{data,error}=await supabase.rpc("get_automated_moderation_dashboard",{requested_tab:tab,requested_limit:100,requested_offset:0});
 if(error)throw new Error("automated_moderation_dashboard_unavailable");
 return(data??[])as AutomatedModerationQueueItem[];
}

export async function getAutomatedModerationHistory(){
 const{supabase}=await requireAdmin();
 const{data,error}=await supabase.rpc("get_automated_moderation_history",{requested_limit:100,requested_offset:0});
 if(error)throw new Error("automated_moderation_history_unavailable");
 return(data??[])as AutomatedModerationHistoryItem[];
}

export async function decideAutomatedQuestion(_state:ModerationState,formData:FormData):Promise<ModerationState>{
 const parsed=automatedAdminDecisionSchema.safeParse({
  questionId:formData.get("questionId"),decision:formData.get("decision"),reason:formData.get("reason")??"",
  warningLevel:formData.get("warningLevel")??0,text:formData.get("text")??undefined,
  options:formData.getAll("options").map(String),
 });
 if(!parsed.success)return{status:"error",message:parsed.error.issues[0]?.message??"Décision invalide."};
 const{userId}=await requireAdmin();const limited=await adminLimit(userId);if(limited)return limited;
 const{error}=await createAdminClient().rpc("admin_decide_automated_question",{
  requested_admin_id:userId,requested_question_id:parsed.data.questionId,requested_decision:parsed.data.decision,
  requested_reason:parsed.data.reason,requested_text:parsed.data.text??null,
  requested_options:parsed.data.decision==="approve_manual_edit"?parsed.data.options:null,
  requested_warning_level:parsed.data.warningLevel,
 });
 if(error){
  const message=error.message.includes("QUESTION_REVIEW_ALREADY_DECIDED")?"Cette question a déjà été traitée.":error.message.includes("suggested_rewrite_unavailable")?"Aucune réécriture suggérée n’est disponible.":"La décision n’a pas pu être enregistrée.";
  return{status:"error",message};
 }
 revalidatePath("/admin");revalidatePath("/profil");revalidatePath("/fil");
 return{status:"success",message:parsed.data.decision==="request_rewrite"?"La réécriture a été demandée.":parsed.data.decision==="reject"?"La question a été refusée.":"La question a été validée et publiée."};
}

export async function getMyModeratedQuestion(){
 const{supabase}=await requireActiveProfile();const{data,error}=await supabase.rpc("get_my_moderated_question");
 if(error)throw new Error("my_moderated_question_unavailable");
 return(Array.isArray(data)?data[0]??null:data??null)as MyModeratedQuestion|null;
}

export async function resubmitQuestionRevision(_state:ModerationState,formData:FormData):Promise<ModerationState>{
 const parsed=questionRevisionSchema.safeParse({questionId:formData.get("questionId"),text:formData.get("text"),options:formData.getAll("options").map(String)});
 if(!parsed.success)return{status:"error",message:parsed.error.issues[0]?.message??"Vérifiez votre question."};
 if(containsProhibitedContactDetails(parsed.data.text)||parsed.data.options.some(containsProhibitedContactDetails))return{status:"error",message:"Les coordonnées et liens ne sont pas autorisés."};
 const{userId}=await requireActiveProfile();
 const analysis=await analyzeSubmissionContent(parsed.data.text,parsed.data.options);
 const{error}=await createAdminClient().rpc("resubmit_automated_question_revision",{
  requested_user_id:userId,requested_question_id:parsed.data.questionId,requested_text:parsed.data.text,
  requested_options:parsed.data.options,requested_moderation:analysis,
 });
 if(error)return{status:"error",message:error.message.includes("QUESTION_REVISION_UNAVAILABLE")?"Cette question ne peut plus être modifiée.":"La question n’a pas pu être renvoyée."};
 revalidatePath("/profil");revalidatePath("/admin");
 return{status:"success",message:"Votre question a été renvoyée à l’équipe Ekoa."};
}
