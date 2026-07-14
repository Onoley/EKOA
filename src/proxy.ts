import type { NextRequest } from "next/server";
import { hasSupabaseEnv } from "@/lib/config/env";
import { refreshSession } from "@/lib/supabase/proxy";

export async function proxy(request: NextRequest) {
  if (!hasSupabaseEnv()) return;
  return refreshSession(request);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
