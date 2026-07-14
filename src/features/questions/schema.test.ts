import { describe, expect, it } from "vitest";
import { questionSchema } from "./schema";

const valid = { questionId: null, previousWaveId: null, text: "Préférez-vous travailler quatre jours par semaine ?", categoryId: crypto.randomUUID(), options: ["Oui", "Non"], tags: ["travail"], minAge: null, maxAge: null };
describe("questionSchema", () => {
  it("accepte une question complète", () => expect(questionSchema.safeParse(valid).success).toBe(true));
  it("refuse les réponses en double", () => expect(questionSchema.safeParse({ ...valid, options: ["Oui", "oui !"] }).success).toBe(false));
  it("refuse les coordonnées", () => expect(questionSchema.safeParse({ ...valid, text: "Écrivez-moi à test@example.fr pour répondre" }).success).toBe(false));
  it("refuse une tranche d’âge inversée", () => expect(questionSchema.safeParse({ ...valid, minAge: 50, maxAge: 30 }).success).toBe(false));
});
