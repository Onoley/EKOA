import "server-only";

import { getOperationsEnv } from "@/lib/config/env";

type LogLevel = "info" | "warn" | "error";
type OperationalEvent =
  | "auth.error" | "publication.error" | "vote.error" | "report.error"
  | "event.error" | "admin.error" | "rate_limit.denied" | "maintenance.completed" | "maintenance.error"
  | "comment.error" | "feed.error" | "discovery.error";

type SafeContext = { scope?: string; code?: string; status?: number; count?: number; durationMs?: number };

export function logOperational(level: LogLevel, event: OperationalEvent, context: SafeContext = {}) {
  const entry = JSON.stringify({ timestamp: new Date().toISOString(), level, event, ...context });
  if (level === "error") console.error(entry);
  else if (level === "warn") console.warn(entry);
  else console.info(entry);
}

export async function sendOperationalAlert(event: OperationalEvent, context: SafeContext = {}) {
  logOperational("error", event, context);
  const url = getOperationsEnv().OBSERVABILITY_WEBHOOK_URL;
  if (!url) return;
  try {
    await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ service: "ekoa", event, context, occurredAt: new Date().toISOString() }),
      signal: AbortSignal.timeout(3_000),
    });
  } catch {
    logOperational("warn", "event.error", { scope: "alert_delivery", code: "unavailable" });
  }
}
