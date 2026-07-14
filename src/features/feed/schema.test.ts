import { describe, expect, it } from "vitest";
import { candidateSchema, categorySlugSchema } from "./schema";

describe("candidateSchema", () => {
  it("accepte les dates PostgreSQL avec un décalage UTC", () => {
    const result = candidateSchema.safeParse({
      question_id: "00000000-0000-4000-8000-000000000001",
      question_text: "Une question suffisamment longue ?",
      author_id: "00000000-0000-4000-8000-000000000002",
      author_username: "membre",
      author_verified: false,
      category_id: "00000000-0000-4000-8000-000000000003",
      category_name: "Société",
      published_at: "2026-07-13T18:00:00+00:00",
      options: [
        { id: "00000000-0000-4000-8000-000000000004", text: "Oui" },
        { id: "00000000-0000-4000-8000-000000000005", text: "Non" },
      ],
      vote_count: 0,
      upvote_count: 0,
      follow_count: 0,
      report_count: 0,
      impression_count: 0,
      followed_category: false,
      followed_author: false,
      initially_followed: false,
    });

    expect(result.success).toBe(true);
  });
});

describe("categorySlugSchema", () => {
  it("accepte un slug de catégorie", () => expect(categorySlugSchema.safeParse("actualite-societe").success).toBe(true));
  it("refuse une valeur non normalisée", () => expect(categorySlugSchema.safeParse("Actualité société").success).toBe(false));
});
