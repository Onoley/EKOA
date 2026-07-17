import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

export async function getAdminProfileIds(db: SupabaseClient, userIds: string[]) {
  const uniqueIds = [...new Set(userIds)];
  if (!uniqueIds.length) return new Set<string>();
  const { data, error } = await db.from("profiles").select("user_id").in("user_id", uniqueIds).eq("role", "admin").eq("account_status", "active");
  if (error) throw new Error("admin_badge_lookup_failed");
  return new Set((data ?? []).map((profile) => profile.user_id as string));
}
