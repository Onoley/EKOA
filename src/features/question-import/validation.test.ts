import { describe, expect, it } from "vitest";

import { validRawRow, validationContext } from "./fixtures";
import { validateQuestionRows } from "./validation";

function codes(overrides: Parameters<typeof validRawRow>[0]) {
  return validateQuestionRows([validRawRow(overrides)], validationContext()).errors.map((error) => error.code);
}

describe("validation de l’import éditorial", () => {
  it("accepte une question valide", () => {
    const result = validateQuestionRows([validRawRow()], validationContext());
    expect(result.errors).toEqual([]);
    expect(result.questions).toHaveLength(1);
    expect(result.questions[0].contentHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("refuse les identifiants dupliqués", () => {
    const result = validateQuestionRows([validRawRow(), validRawRow({ question: "Une autre question suffisamment longue ?" })], validationContext());
    expect(result.errors.map((error) => error.code)).toContain("external_id_duplicate");
  });

  it("refuse une catégorie inconnue", () => expect(codes({ category_slug: "inconnue" })).toContain("category_unknown"));
  it("refuse un univers incohérent", () => expect(codes({ universe_slug: "culture" })).toContain("universe_category_mismatch"));
  it("refuse un tag inconnu ou inactif", () => expect(codes({ tag_1: "inconnu" })).toContain("tag_unknown"));
  it("avertit sans bloquer pour un tag actif non recommandé", () => {
    const context = validationContext(); context.taxonomy.categoryTags.clear();
    const result = validateQuestionRows([validRawRow()], context);
    expect(result.errors).toEqual([]);
    expect(result.warnings.map((warning) => warning.code)).toContain("tag_category_unrecommended");
  });
  it("refuse moins de deux options", () => expect(codes({ option_2: "", option_3: "" })).toContain("option_count"));
  it("refuse un trou dans les options", () => expect(codes({ option_2: "", option_3: "Peut-être" })).toContain("option_gap"));
  it("refuse une option dupliquée", () => expect(codes({ option_2: "OUI" })).toContain("option_duplicate"));
  it("refuse une URL", () => expect(codes({ question: "Que pensez-vous de https://example.com aujourd’hui ?" })).toContain("url_forbidden"));
  it("refuse une tranche d’âge incohérente", () => expect(codes({ minimum_age: "80", maximum_age: "20" })).toContain("age_range_invalid"));
  it("refuse le contenu interdit", () => expect(codes({ option_1: "Contenu interdit" })).toContain("forbidden_content"));

  it("ignore un external_id déjà importé avec le même contenu", () => {
    const first = validateQuestionRows([validRawRow()], validationContext()).questions[0];
    const context = validationContext();
    context.existingQuestions = [{ externalId: first.externalId, contentHash: first.contentHash, normalizedText: first.normalizedQuestion }];
    const result = validateQuestionRows([validRawRow()], context);
    expect(result.errors).toEqual([]);
    expect(result.questions[0].outcome).toBe("skip");
  });

  it("signale un conflit de contenu pour un external_id existant", () => {
    const context = validationContext();
    context.existingQuestions = [{ externalId: "EKOA-0001", contentHash: "a".repeat(64), normalizedText: "ancienne question" }];
    const result = validateQuestionRows([validRawRow()], context);
    expect(result.conflicts).toBe(1);
    expect(result.errors.map((error) => error.code)).toContain("external_id_conflict");
  });

  it("refuse une question identique sous un autre identifiant", () => {
    const first = validateQuestionRows([validRawRow()], validationContext()).questions[0];
    const context = validationContext();
    context.existingQuestions = [{ externalId: "AUTRE-ID", contentHash: "b".repeat(64), normalizedText: first.normalizedQuestion }];
    expect(validateQuestionRows([validRawRow()], context).errors.map((error) => error.code)).toContain("question_duplicate");
  });
});
