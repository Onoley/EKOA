import { describe, expect, it } from "vitest";
import { passwordSchema } from "./schema";

describe("passwordSchema", () => {
  it("accepte un mot de passe robuste", () => {
    expect(passwordSchema.safeParse("EkoaForum2026").success).toBe(true);
  });

  it.each(["court1A", "sansmajuscule1", "SANSMINUSCULE1", "SansChiffreLong"])(
    "refuse %s",
    (password) => expect(passwordSchema.safeParse(password).success).toBe(false),
  );
});
