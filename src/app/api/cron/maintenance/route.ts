import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { getOperationsEnv } from "@/lib/config/env";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendOperationalAlert, logOperational } from "@/lib/observability/logger";

function secretMatches(header: string | null, secret: string) {
  const candidate = Buffer.from(header?.replace(/^Bearer\s+/i, "") ?? "");
  const expected = Buffer.from(secret);
  return candidate.length === expected.length && timingSafeEqual(candidate, expected);
}

export async function GET(request: Request) {
  const env = getOperationsEnv();
  if (!env.CRON_SECRET) return NextResponse.json({ message: "Maintenance non configurée." }, { status: 503 });
  if (!secretMatches(request.headers.get("authorization"), env.CRON_SECRET)) return NextResponse.json({ message: "Accès refusé." }, { status: 401 });
  const started = Date.now();
  const admin=createAdminClient();
  const [{data,error},{error:recommendationError}]=await Promise.all([
    admin.rpc("run_operational_maintenance", { requested_retention_days: env.ANALYTICS_RETENTION_DAYS }),
    admin.rpc("cleanup_feed_recommendation_v1"),
  ]);
  if (error||recommendationError) {
    await sendOperationalAlert("maintenance.error", { code: "database_failure" });
    return NextResponse.json({ message: "Maintenance en échec." }, { status: 500 });
  }
  logOperational("info", "maintenance.completed", { count: Array.isArray(data) ? data.length : 0, durationMs: Date.now() - started });
  return NextResponse.json({ status: "ok" });
}
