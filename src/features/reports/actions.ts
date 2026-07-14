"use server";

import { requireActiveProfile } from "@/features/auth/authorization";
import { consumeRateLimit } from "@/lib/rate-limit/rate-limit";
import { logOperational, sendOperationalAlert } from "@/lib/observability/logger";
import { reportInputSchema } from "./schema";

export type ReportState = { status: "idle" | "success" | "error"; message: string };

export async function submitReport(_state: ReportState, formData: FormData): Promise<ReportState> {
  const parsed = reportInputSchema.safeParse({ targetType: formData.get("targetType"), targetId: formData.get("targetId"), reason: formData.get("reason"), details: formData.get("details") });
  if (!parsed.success) return { status: "error", message: parsed.error.issues[0]?.message ?? "Signalement invalide." };
  const { supabase, userId } = await requireActiveProfile();
  try {
    if (!(await consumeRateLimit("report", userId))) {
      await sendOperationalAlert("rate_limit.denied", { scope: "report", status: 429 });
      return { status: "error", message: "Trop de signalements rapprochés. Réessayez plus tard." };
    }
  } catch { return { status: "error", message: "Le signalement est momentanément indisponible." }; }
  const { data, error } = await supabase.rpc("submit_report", { requested_target: parsed.data.targetType, requested_target_id: parsed.data.targetId, requested_reason: parsed.data.reason, requested_details: parsed.data.details || null });
  if (error) {
    logOperational("warn", "report.error", { code: "database_rejected" });
    return { status: "error", message: error.message.includes("target_unavailable") ? "Ce contenu n’est plus disponible." : "Le signalement n’a pas pu être envoyé." };
  }
  const row = Array.isArray(data) ? data[0] as { created?: unknown } | undefined : undefined;
  if (typeof row?.created !== "boolean") return { status: "error", message: "La réponse du serveur est invalide." };
  return { status: "success", message: row.created ? "Signalement envoyé. Merci." : "Vous avez déjà signalé ce contenu." };
}
