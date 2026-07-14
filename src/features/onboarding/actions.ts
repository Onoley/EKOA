"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { parseOnboardingForm } from "./schema";

export type OnboardingState = { status: "idle" | "error"; message: string; fieldErrors?: Record<string, string[]> };

const errorMessages: Record<string, string> = {
  username_unavailable: "Ce nom d’utilisateur est déjà utilisé.",
  age_ineligible: "Ekoa est réservé aux personnes de 18 ans ou plus.",
  invalid_categories: "Choisissez au moins trois catégories disponibles.",
  onboarding_unavailable: "Cet onboarding ne peut plus être modifié.",
};

export async function completeOnboarding(
  _state: OnboardingState,
  formData: FormData,
): Promise<OnboardingState> {
  const parsed = parseOnboardingForm(formData);
  if (!parsed.success) {
    return {
      status: "error",
      message: "Vérifiez les informations indiquées.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  const supabase = await createClient();
  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims();
  if (claimsError || !claimsData?.claims?.sub) {
    return { status: "error", message: "Votre session a expiré. Reconnectez-vous." };
  }

  const { data: profile } = await supabase.from("profiles").select("account_status")
    .eq("user_id", claimsData.claims.sub).maybeSingle<{ account_status: string }>();
  if (!profile || profile.account_status !== "pending_onboarding") {
    return { status: "error", message: "Cet onboarding n’est pas disponible." };
  }

  const input = parsed.data;
  const { error } = await supabase.rpc("complete_onboarding", {
    requested_username: input.username,
    requested_birth_year: input.birthYear,
    requested_department_code: input.departmentCode,
    requested_professional_activity: input.professionalActivity,
    requested_gender: input.gender,
    requested_category_ids: input.categoryIds,
  });

  if (error) {
    const key = Object.keys(errorMessages).find((candidate) => error.message.includes(candidate));
    return { status: "error", message: key ? errorMessages[key] : "Impossible de finaliser votre profil. Réessayez." };
  }

  redirect("/fil");
}
