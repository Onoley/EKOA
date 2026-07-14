import { describe, expect, it } from "vitest";
import { answerOverlap, normalizeQuestionText } from "./normalization";

describe("normalizeQuestionText", () => {
  it("normalise accents, casse, ponctuation et espaces", () => {
    expect(normalizeQuestionText("  Êtes-vous d’accord ?  ")).toBe("etes vous d accord");
  });
  it("compare les réponses sans tenir compte de leur ordre", () => {
    expect(answerOverlap(["Oui", "Non"], ["non", "Oui !"])).toBe(1);
  });
});
