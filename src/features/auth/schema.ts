import { z } from "zod";

export const emailSchema = z.email("Saisissez une adresse e-mail valide.");
export const passwordSchema = z.string()
  .min(10, "Le mot de passe doit contenir au moins 10 caractères.")
  .max(128, "Le mot de passe ne peut pas dépasser 128 caractères.")
  .regex(/[a-z]/, "Ajoutez au moins une lettre minuscule.")
  .regex(/[A-Z]/, "Ajoutez au moins une lettre majuscule.")
  .regex(/[0-9]/, "Ajoutez au moins un chiffre.");

const credentialsSchema = z.object({ email: emailSchema, password: passwordSchema });
const passwordConfirmationSchema = credentialsSchema.extend({
  passwordConfirmation: z.string(),
}).refine((value) => value.password === value.passwordConfirmation, {
  message: "Les mots de passe ne correspondent pas.",
  path: ["passwordConfirmation"],
});

function values(formData: FormData) {
  return {
    email: formData.get("email"),
    password: formData.get("password"),
    passwordConfirmation: formData.get("passwordConfirmation"),
  };
}

export function parseCredentials(formData: FormData) {
  return credentialsSchema.safeParse(values(formData));
}

export function parsePasswordConfirmation(formData: FormData) {
  return passwordConfirmationSchema.safeParse(values(formData));
}
