import "server-only";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { sponsorshipSchema } from "./schema";

export async function getActiveSponsorships(questionIds: string[]) {
  if (!questionIds.length) return new Map<string,string>();
  const { data, error } = await createAdminClient().rpc("get_active_sponsorships", { requested_question_ids: questionIds });
  if (error) throw new Error("sponsorship_lookup_failed");
  const parsed = z.array(sponsorshipSchema).safeParse(data ?? []);
  if (!parsed.success) throw new Error("sponsorship_response_invalid");
  return new Map(parsed.data.map((row) => [row.question_id, row.organisation_name]));
}
