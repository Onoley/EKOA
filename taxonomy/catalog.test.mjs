import { describe, expect, it } from "vitest";

import { categoryTags, categories, tags, universes, validateCatalog } from "./catalog.mjs";

describe("taxonomie canonique", () => {
  it("conserve les cardinalités éditoriales attendues", () => {
    expect(() => validateCatalog()).not.toThrow();
    expect(universes).toHaveLength(7);
    expect(categories).toHaveLength(30);
    expect(tags).toHaveLength(183);
  });

  it("associe chaque catégorie à des tags contrôlés", () => {
    const categorySlugs = new Set(categories.map(({ slug }) => slug));
    const tagSlugs = new Set(tags.map(({ slug }) => slug));
    const associations = Object.entries(categoryTags).flatMap(([category, assignedTags]) =>
      assignedTags.map((tag) => ({ category, tag })),
    );
    const associatedCategories = new Set(associations.map(({ category }) => category));

    expect(associatedCategories).toEqual(categorySlugs);
    expect(associations.every(({ category, tag }) => categorySlugs.has(category) && tagSlugs.has(tag))).toBe(true);
  });
});
