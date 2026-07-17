import { z } from "zod";
import { normalizeQuestionText } from "./normalization";

export const QUESTION_MAX_LENGTH = 180;
export const OPTION_MAX_LENGTH = 80;

export const questionSchema = z.object({
  questionId: z.uuid().nullable(),
  previousWaveId: z.uuid().nullable(),
  text: z.string().trim().min(10, "La question doit contenir au moins 10 caractères.").max(QUESTION_MAX_LENGTH, `La question est limitée à ${QUESTION_MAX_LENGTH} caractères.`),
  categoryId: z.uuid("Sélectionnez une catégorie."),
  options: z.array(z.string().trim().min(1, "Une réponse ne peut pas être vide.").max(OPTION_MAX_LENGTH, `Une réponse est limitée à ${OPTION_MAX_LENGTH} caractères.`)).min(2).max(6)
    .refine((values) => new Set(values.map(normalizeQuestionText)).size === values.length, "Chaque réponse doit être différente."),
  tags: z.array(z.string().trim().min(1).max(30).regex(/^[\p{L}\p{N} &'’+-]+$/u, "Un tag contient des caractères non autorisés.")).max(3, "Ajoutez au maximum trois tags."),
  minAge: z.number().int().min(18).max(120).nullable(),
  maxAge: z.number().int().min(18).max(120).nullable(),
}).refine((value) => value.minAge === null || value.maxAge === null || value.minAge <= value.maxAge, { path: ["maxAge"], message: "L’âge maximum doit être supérieur à l’âge minimum." });

function optionalNumber(value: FormDataEntryValue | null) {
  if (typeof value !== "string" || value.trim() === "") return null;
  return Number(value);
}

function optionalUuid(value: FormDataEntryValue | null) {
  return typeof value === "string" && value ? value : null;
}

export function parseQuestionForm(formData: FormData) {
  const options = Array.from({ length: 6 }, (_, index) => formData.get(`option${index + 1}`))
    .filter((value): value is string => typeof value === "string" && value.trim() !== "");
  const rawTags = formData.getAll("tags").map((tag)=>String(tag).trim()).filter(Boolean);
  return questionSchema.safeParse({
    questionId: optionalUuid(formData.get("questionId")),
    previousWaveId: optionalUuid(formData.get("previousWaveId")),
    text: formData.get("text"), categoryId: formData.get("categoryId"), options,
    tags: rawTags, minAge: optionalNumber(formData.get("minAge")), maxAge: optionalNumber(formData.get("maxAge")),
  });
}
