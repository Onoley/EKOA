import "server-only";

import { createHash } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";

export type RateLimitScope = "auth" | "publication" | "vote" | "report" | "event" | "admin";

const policies: Record<RateLimitScope, { limit: number; windowSeconds: number }> = {
  auth: { limit: 5, windowSeconds: 15 * 60 },
  publication: { limit: 8, windowSeconds: 60 * 60 },
  vote: { limit: 60, windowSeconds: 60 },
  report: { limit: 10, windowSeconds: 60 * 60 },
  event: { limit: 120, windowSeconds: 60 },
  admin: { limit: 60, windowSeconds: 60 },
};

export async function consumeRateLimit(scope: RateLimitScope, identifier: string) {
  const policy = policies[scope];
  const subjectHash = createHash("sha256").update(`${scope}:${identifier.trim().toLowerCase()}`).digest("hex");
  const { data, error } = await createAdminClient().rpc("consume_rate_limit", {
    requested_scope: scope,
    requested_subject_hash: subjectHash,
    requested_limit: policy.limit,
    requested_window_seconds: policy.windowSeconds,
  });
  if (error || typeof data !== "boolean") throw new Error("rate_limit_unavailable");
  return data;
}
