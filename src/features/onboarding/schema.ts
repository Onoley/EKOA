import { z } from "zod";

export const professionalActivities = [
  ["student", "Études"], ["employee", "Salariat"], ["self_employed", "Indépendant·e"],
  ["public_service", "Fonction publique"], ["job_seeker", "Recherche d’emploi"],
  ["retired", "Retraite"], ["without_activity", "Sans activité professionnelle"],
  ["other", "Autre"], ["prefer_not_to_say", "Je préfère ne pas répondre"],
] as const;

export const genderValues = [
  ["woman", "Femme"], ["man", "Homme"], ["non_binary", "Non-binaire"],
  ["other", "Autre"], ["prefer_not_to_say", "Je préfère ne pas répondre"],
] as const;

const activityKeys = professionalActivities.map(([value]) => value) as [string, ...string[]];
const genderKeys = genderValues.map(([value]) => value) as [string, ...string[]];

export const onboardingSchema = z.object({
  username: z.string().trim().min(3, "Le nom d’utilisateur doit contenir au moins 3 caractères.")
    .max(24, "Le nom d’utilisateur est limité à 24 caractères.")
    .regex(/^[A-Za-z0-9_]+$/, "Utilisez uniquement des lettres, chiffres et le caractère _.") ,
  birthYear: z.coerce.number().int().min(new Date().getFullYear() - 120, "Vérifiez votre année de naissance.")
    .max(new Date().getFullYear() - 18, "Ekoa est réservé aux personnes de 18 ans ou plus."),
  departmentCode: z.string().trim().toUpperCase()
    .regex(/^(0[1-9]|1[0-9]|2[1-9]|[3-8][0-9]|9[0-5]|2A|2B|97[1-6])$/, "Saisissez un code de département français valide."),
  professionalActivity: z.enum(activityKeys, { error: "Sélectionnez une activité." }),
  gender: z.preprocess((value) => value === "" ? null : value, z.enum(genderKeys).nullable()),
  categoryIds: z.array(z.uuid()).min(3, "Choisissez au moins trois catégories."),
});

export type OnboardingInput = z.infer<typeof onboardingSchema>;

export function parseOnboardingForm(formData: FormData) {
  return onboardingSchema.safeParse({
    username: formData.get("username"),
    birthYear: formData.get("birthYear"),
    departmentCode: formData.get("departmentCode"),
    professionalActivity: formData.get("professionalActivity"),
    gender: formData.get("gender"),
    categoryIds: formData.getAll("categoryIds"),
  });
}
