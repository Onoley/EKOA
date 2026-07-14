"use server";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/features/auth/authorization";
import { consumeRateLimit } from "@/lib/rate-limit/rate-limit";
import { campaignInputSchema, campaignStatusInputSchema, organisationInputSchema } from "./schema";

export type SponsorshipState={status:"idle"|"success"|"error";message:string};
async function adminContext(){const context=await requireAdmin();if(!await consumeRateLimit("admin",context.userId))throw new Error("rate_limited");return context;}
export async function createSponsorOrganisation(_state:SponsorshipState,formData:FormData):Promise<SponsorshipState>{
 const parsed=organisationInputSchema.safeParse({ownerUserId:formData.get("ownerUserId"),legalName:formData.get("legalName")});if(!parsed.success)return{status:"error",message:"Vérifiez l’organisation et son propriétaire."};
 try{const{supabase}=await adminContext();const{error}=await supabase.rpc("admin_create_sponsor_organisation",{requested_owner_user_id:parsed.data.ownerUserId,requested_legal_name:parsed.data.legalName});if(error)return{status:"error",message:error.message.includes("verified_owner_required")?"Le propriétaire doit être une organisation vérifiée active.":"L’organisation n’a pas pu être créée."};revalidatePath("/admin");return{status:"success",message:"Organisation sponsor créée et auditée."}}catch{return{status:"error",message:"Action momentanément indisponible."}}
}
export async function createSponsorCampaign(_state:SponsorshipState,formData:FormData):Promise<SponsorshipState>{
 const parsed=campaignInputSchema.safeParse({sponsorId:formData.get("sponsorId"),questionId:formData.get("questionId"),name:formData.get("name"),kind:formData.get("kind"),startsAt:formData.get("startsAt"),endsAt:formData.get("endsAt"),responseTarget:formData.get("responseTarget"),budgetEuros:formData.get("budgetEuros"),policyConfirmed:formData.get("policyConfirmed")});if(!parsed.success)return{status:"error",message:parsed.error.issues[0]?.message??"Campagne invalide."};
 try{const{supabase}=await adminContext();const{error}=await supabase.rpc("admin_create_sponsor_campaign",{requested_sponsor_id:parsed.data.sponsorId,requested_question_id:parsed.data.questionId,requested_name:parsed.data.name,requested_kind:parsed.data.kind,requested_starts_at:parsed.data.startsAt,requested_ends_at:parsed.data.endsAt,requested_response_target:parsed.data.responseTarget,requested_budget_cents:Math.round(parsed.data.budgetEuros*100),requested_policy_confirmed:true});if(error)return{status:"error",message:error.message.includes("political_sponsorship_forbidden")?"Le sponsoring politique est interdit.":"La campagne n’a pas pu être créée."};revalidatePath("/admin");return{status:"success",message:"Campagne créée en brouillon et auditée."}}catch{return{status:"error",message:"Action momentanément indisponible."}}
}
export async function setSponsorCampaignStatus(_state:SponsorshipState,formData:FormData):Promise<SponsorshipState>{
 const parsed=campaignStatusInputSchema.safeParse({campaignId:formData.get("campaignId"),status:formData.get("status"),reason:formData.get("reason")});if(!parsed.success)return{status:"error",message:"Statut ou justification invalide."};
 try{const{supabase}=await adminContext();const{error}=await supabase.rpc("admin_set_sponsor_campaign_status",{requested_campaign_id:parsed.data.campaignId,requested_status:parsed.data.status,requested_reason:parsed.data.reason});if(error)return{status:"error",message:"Le statut n’a pas pu être modifié."};revalidatePath("/admin");return{status:"success",message:"Cycle de vie mis à jour et audité."}}catch{return{status:"error",message:"Action momentanément indisponible."}}
}
