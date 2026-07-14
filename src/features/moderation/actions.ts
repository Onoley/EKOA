"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin, requireModerator } from "@/features/auth/authorization";
import { logOperational } from "@/lib/observability/logger";
import { consumeRateLimit } from "@/lib/rate-limit/rate-limit";
import { forbiddenTermSchema, moderationInputSchema, suspensionSchema, verificationSchema } from "./schema";

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
