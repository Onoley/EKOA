import { describe, expect, it } from "vitest";
import { onboardingSchema } from "./schema";

const valid = {
  username: "claire_75", birthYear: 1992, departmentCode: "75",
  professionalActivity: "employee", gender: "prefer_not_to_say",
  categoryIds: [crypto.randomUUID(), crypto.randomUUID(), crypto.randomUUID()],
};

describe("onboardingSchema", () => {
  it("accepte un profil majeur avec trois catégories", () => {
    expect(onboardingSchema.safeParse(valid).success).toBe(true);
  });

  it("accepte le genre facultatif vide", () => {
    expect(onboardingSchema.parse({ ...valid, gender: "" }).gender).toBeNull();
  });

  it("accepte de ne pas renseigner le genre", () => {
    const result = onboardingSchema.parse({ ...valid, gender: "" });
    expect(result.gender).toBeNull();
  });

  it("refuse une personne mineure", () => {
    expect(onboardingSchema.safeParse({ ...valid, birthYear: new Date().getFullYear() - 17 }).success).toBe(false);
  });

  it("refuse moins de trois catégories", () => {
    expect(onboardingSchema.safeParse({ ...valid, categoryIds: valid.categoryIds.slice(0, 2) }).success).toBe(false);
  });

  it("normalise le code départemental corse", () => {
    const result = onboardingSchema.parse({ ...valid, departmentCode: "2a" });
    expect(result.departmentCode).toBe("2A");
  });

  it("refuse l’ancien code départemental 20", () => {
    expect(onboardingSchema.safeParse({ ...valid, departmentCode: "20" }).success).toBe(false);
  });
});
