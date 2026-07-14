import { NextResponse } from "next/server";
import { hasSupabaseEnv } from "@/lib/config/env";

export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json(
    { status: hasSupabaseEnv() ? "ok" : "configuration_incomplete" },
    { status: hasSupabaseEnv() ? 200 : 503, headers: { "cache-control": "no-store" } },
  );
}
