import { describe, expect, it } from "vitest";

import { buildTaxonomySyncPlan, type ExistingTag } from "./taxonomy-sync";
import type { WorkbookTag } from "./taxonomy-workbook";

const tag: WorkbookTag = { slug: "nouveau", name: "Nouveau", normalizedName: "nouveau", description: "Description", sensitivity: "low", isFeatured: false, isActive: true, suggestedCategorySlugs: [], displayOrder: 1 };

describe("plan de synchronisation taxonomique", () => {
  it("crée un tag absent et déduplique les couples", () => {
    const plan = buildTaxonomySyncPlan([tag], [{ categorySlug: "cat", tagSlug: "nouveau" }, { categorySlug: "cat", tagSlug: "nouveau" }], [], new Set());
    expect(plan.create).toEqual([tag]);
    expect(plan.associationKeysToCreate).toEqual(["cat:nouveau"]);
  });
  it("est idempotent lorsque les données existent", () => {
    const existing: ExistingTag = { ...tag, id: "id" };
    const plan = buildTaxonomySyncPlan([tag], [{ categorySlug: "cat", tagSlug: "nouveau" }], [existing], new Set(["cat:nouveau"]));
    expect(plan.unchanged).toEqual([tag]);
    expect(plan.create).toEqual([]);
    expect(plan.associationKeysToCreate).toEqual([]);
  });
  it("réactive un tag sans suppression", () => {
    const existing: ExistingTag = { ...tag, id: "id", isActive: false };
    expect(buildTaxonomySyncPlan([tag], [], [existing], new Set()).reactivate).toEqual([tag]);
  });
});

