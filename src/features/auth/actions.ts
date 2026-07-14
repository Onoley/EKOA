"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getPublicEnv } from "@/lib/config/env";
import { consumeRateLimit } from "@/lib/rate-limit/rate-limit";
import { logOperational } from "@/lib/observability/logger";
import { emailSchema, passwordSchema, parseCredentials, parsePasswordConfirmation } from "./schema";

export type AuthActionState = { message: string; status: "idle" | "success" | "error" };

const errorState = (message: string): AuthActionState => ({ status: "error", message });

async function allowAuthAttempt(email: string) {
  try {
    return await consumeRateLimit("auth", email);
  } catch {
    return false;
  }
}

export async function signIn(
  _state: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const result = parseCredentials(formData);
  if (!result.success) return errorState(result.error.issues[0].message);
  if (!(await allowAuthAttempt(result.data.email))) {
    return errorState("Trop de tentatives. Patientez avant de réessayer.");
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(result.data);
  if (error) {
    logOperational("warn", "auth.error", { code: "invalid_credentials" });
    return errorState("Adresse e-mail ou mot de passe incorrect.");
  }

  redirect("/");
}

export async function signUp(
  _state: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const result = parsePasswordConfirmation(formData);
  if (!result.success) return errorState(result.error.issues[0].message);
  if (!(await allowAuthAttempt(result.data.email))) {
    return errorState("Trop de demandes. Patientez avant de réessayer.");
  }

  const supabase = await createClient();
  const origin = getPublicEnv().NEXT_PUBLIC_SITE_URL;
  const { error } = await supabase.auth.signUp({
    email: result.data.email,
    password: result.data.password,
    options: { emailRedirectTo: `${origin}/auth/callback` },
  });
  if (error) {
    logOperational("error", "auth.error", { code: "signup_failed" });
    return errorState("L’inscription n’a pas pu aboutir. Réessayez dans un instant.");
  }

  return {
    status: "success",
    message: "Vérifiez votre messagerie pour confirmer votre adresse e-mail.",
  };
}

export async function requestPasswordReset(
  _state: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const result = emailSchema.safeParse(formData.get("email"));
  if (!result.success) return errorState(result.error.issues[0].message);
  if (!(await allowAuthAttempt(result.data))) {
    return errorState("Trop de demandes. Patientez avant de réessayer.");
  }

  const supabase = await createClient();
  const origin = getPublicEnv().NEXT_PUBLIC_SITE_URL;
  const { error } = await supabase.auth.resetPasswordForEmail(result.data, {
    redirectTo: `${origin}/auth/callback?next=/mot-de-passe/nouveau`,
  });
  if (error) logOperational("warn", "auth.error", { code: "reset_failed" });

  return {
    status: "success",
    message: "Si un compte correspond à cette adresse, un e-mail vient d’être envoyé.",
  };
}

export async function updatePassword(
  _state: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const result = passwordSchema.safeParse(formData.get("password"));
  const confirmation = formData.get("passwordConfirmation");
  if (!result.success) return errorState(result.error.issues[0].message);
  if (result.data !== confirmation) return errorState("Les mots de passe ne correspondent pas.");

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return errorState("Ce lien n’est plus valide. Demandez un nouvel e-mail.");

  const { error } = await supabase.auth.updateUser({ password: result.data });
  if (error) return errorState("Le mot de passe n’a pas pu être enregistré.");
  redirect("/");
}

export async function signOut() {
  const supabase = await createClient();
  const { error } = await supabase.auth.signOut();
  if (error) throw new Error("La déconnexion a échoué. Réessayez.");
  redirect("/");
}
