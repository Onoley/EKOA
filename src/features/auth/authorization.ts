import "server-only";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type Profile = {
  user_id: string;
  username: string | null;
  birth_year: number | null;
  department_code: string | null;
  professional_activity: string | null;
  gender: string | null;
  role: "user" | "moderator" | "admin";
  account_type: "ordinary" | "verified";
  account_status: "pending_onboarding" | "active" | "suspended" | "deletion_requested" | "anonymized";
  created_at: string;
};

export async function getSessionContext() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims?.sub) return { supabase, userId: null, profile: null };

  const { data: profile } = await supabase
    .from("profiles")
    .select("user_id,username,birth_year,department_code,professional_activity,gender,role,account_type,account_status,created_at")
    .eq("user_id", data.claims.sub)
    .maybeSingle<Profile>();

  return { supabase, userId: data.claims.sub, profile };
}

export async function requireActiveProfile() {
  const context = await getSessionContext();
  if (!context.userId) redirect("/");
  if (!context.profile || context.profile.account_status === "pending_onboarding") redirect("/onboarding");
  if (context.profile.account_status !== "active") redirect("/compte-indisponible");
  return { ...context, profile: context.profile };
}

export async function requireModerator() {
  const context = await requireActiveProfile();
  if (!['moderator','admin'].includes(context.profile.role)) redirect('/fil');
  return context;
}

export async function requireAdmin() {
  const context = await requireActiveProfile();
  if (context.profile.role !== 'admin') redirect('/fil');
  return context;
}
