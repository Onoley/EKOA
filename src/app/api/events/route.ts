import { NextResponse } from "next/server";
import { getSessionContext } from "@/features/auth/authorization";
import { eventSchema } from "@/features/feed/schema";
import { consumeRateLimit } from "@/lib/rate-limit/rate-limit";
import { logOperational } from "@/lib/observability/logger";

export async function POST(request: Request) {
  const context = await getSessionContext();
  if (!context.userId || context.profile?.account_status !== "active") return NextResponse.json({ message: "Authentification requise." }, { status: 401 });
  try {
    if (!(await consumeRateLimit("event", context.userId))) {
      logOperational("warn", "rate_limit.denied", { scope: "event", status: 429 });
      return NextResponse.json({ message: "Trop d’événements rapprochés." }, { status: 429 });
    }
  } catch { return NextResponse.json({ message: "Télémétrie indisponible." }, { status: 503 }); }
  const payload = eventSchema.safeParse(await request.json().catch(() => null));
  if (!payload.success) return NextResponse.json({ message: "Événement invalide." }, { status: 400 });
  const event = payload.data;
  const { error } = await context.supabase.rpc("record_feed_event", {
    requested_event_id: event.eventId, requested_type: event.eventType, requested_question_id: event.questionId,
    requested_impression_id: event.impressionId, requested_feed: event.feed, requested_algorithm_version: event.algorithmVersion,
    requested_rank: event.rank, requested_request_id: event.requestId, requested_occurred_at: event.occurredAt, requested_dwell_ms: event.dwellMs ?? null,
  });
  if (error) { logOperational("warn", "event.error", { code: "database_rejected" }); return NextResponse.json({ message: "Événement refusé." }, { status: 400 }); }
  return new NextResponse(null, { status: 202 });
}
