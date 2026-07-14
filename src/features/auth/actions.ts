"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getPublicEnv } from "@/lib/config/env";
import { consumeRateLimit } from "@/lib/rate-limit/rate-limit";
import { logOperational } from "@/lib/observability/logger";

export type AuthActionState = { message: string; status: "idle" | "success" | "error" };

const emailSchema = z.email("Saisissez une adresse e-mail valide.");

export async function requestMagicLink(
  _state: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const result = emailSchema.safeParse(formData.get("email"));
  if (!result.success) return { status: "error", message: result.error.issues[0].message };

  try {
    if (!(await consumeRateLimit("auth", result.data))) {
      logOperational("warn", "rate_limit.denied", { scope: "auth", status: 429 });
      return { status: "error", message: "Trop de demandes. Patientez avant de réessayer." };
    }
  } catch { return { status: "error", message: "Le service est momentanément indisponible." }; }

  const supabase = await createClient();
  const origin = getPublicEnv().NEXT_PUBLIC_SITE_URL;
  const { error } = await supabase.auth.signInWithOtp({
    email: result.data,
    options: { emailRedirectTo: `${origin}/auth/callback` },
  });

  if (error) {
    logOperational("error", "auth.error", { code: "magic_link_failed" });
    return { status: "error", message: "Le lien n’a pas pu être envoyé. Réessayez dans un instant." };
  }

  return {
    status: "success",
    message: "Lien envoyé. Consultez votre messagerie pour continuer.",
  };
}

export async function signOut() {
  const supabase = await createClient();
  const { error } = await supabase.auth.signOut();
  if (error) throw new Error("La déconnexion a échoué. Réessayez.");
  redirect("/");
}
