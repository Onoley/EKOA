import { describe, expect, it } from "vitest";
import { questionSchema } from "./schema";

const valid = { questionId: null, previousWaveId: null, text: "Préférez-vous travailler quatre jours par semaine ?", categoryId: crypto.randomUUID(), options: ["Oui", "Non"], tags: ["travail"], minAge: null, maxAge: null };
describe("questionSchema", () => {
  it("accepte une question complète", () => expect(questionSchema.safeParse(valid).success).toBe(true));
  it("refuse les réponses en double", () => expect(questionSchema.safeParse({ ...valid, options: ["Oui", "oui !"] }).success).toBe(false));
  it("ne pré-modère pas les liens ou coordonnées", () => expect(questionSchema.safeParse({ ...valid, text: "Écrivez-moi à test@example.fr pour répondre" }).success).toBe(true));
  it.each(["Désir d’enfant", "LGBTQIA+", "Liberté d’expression", "Pouvoir d’achat", "Science & innovation"])("accepte le tag contrôlé %s", (tag) => expect(questionSchema.safeParse({ ...valid, tags: [tag] }).success).toBe(true));
  it("refuse toujours les caractères dangereux dans un tag", () => expect(questionSchema.safeParse({ ...valid, tags: ["<script>"] }).success).toBe(false));
  it("accepte les montants en euros dans les réponses", () => expect(questionSchema.safeParse({ ...valid, text: "Quel budget accorderiez-vous à votre mariage ?", options: ["Moins de 10 000 €", "Entre 10 000 € et 25 000 €", "Entre 25 000 € et 50 000 €", "Plus de 50 000 €"] }).success).toBe(true));
  it("ne pré-modère pas le contenu des réponses", () => expect(questionSchema.safeParse({ ...valid, options: ["Appelez le 06 12 34 56 78", "Non"] }).success).toBe(true));
  it("refuse une tranche d’âge inversée", () => expect(questionSchema.safeParse({ ...valid, minAge: 50, maxAge: 30 }).success).toBe(false));
});
