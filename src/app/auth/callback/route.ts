import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const next = request.nextUrl.searchParams.get("next");
  const safeDestination = next === "/mot-de-passe/nouveau" ? next : "/onboarding";
  const destination = new URL(safeDestination, request.url);
  if (!code) return NextResponse.redirect(new URL("/auth/erreur", request.url));

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) return NextResponse.redirect(new URL("/auth/erreur", request.url));
  return NextResponse.redirect(destination);
}
