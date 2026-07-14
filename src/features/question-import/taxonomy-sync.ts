import type { WorkbookTag } from "./taxonomy-workbook";

export type ExistingTag = WorkbookTag & { id: string };
export type TaxonomySyncPlan = {
  create: WorkbookTag[];
  update: WorkbookTag[];
  reactivate: WorkbookTag[];
  unchanged: WorkbookTag[];
  associationKeysToCreate: string[];
};

function sameMetadata(current: ExistingTag, wanted: WorkbookTag): boolean {
  return current.name === wanted.name && current.normalizedName === wanted.normalizedName
    && current.description === wanted.description && current.sensitivity === wanted.sensitivity
    && current.isFeatured === wanted.isFeatured && current.isActive === wanted.isActive;
}

export function buildTaxonomySyncPlan(
  workbookTags: WorkbookTag[],
  usedPairs: Array<{ categorySlug: string; tagSlug: string }>,
  existingTags: ExistingTag[],
  existingAssociationKeys: Set<string>,
): TaxonomySyncPlan {
  const existingBySlug = new Map(existingTags.map((tag) => [tag.slug, tag]));
  const plan: TaxonomySyncPlan = { create: [], update: [], reactivate: [], unchanged: [], associationKeysToCreate: [] };
  for (const tag of workbookTags) {
    const current = existingBySlug.get(tag.slug);
    if (!current) plan.create.push(tag);
    else if (!current.isActive && tag.isActive) plan.reactivate.push(tag);
    else if (!sameMetadata(current, tag)) plan.update.push(tag);
    else plan.unchanged.push(tag);
  }
  plan.associationKeysToCreate = [...new Set(usedPairs.map(({ categorySlug, tagSlug }) => `${categorySlug}:${tagSlug}`))]
    .filter((key) => !existingAssociationKeys.has(key)).sort();
  return plan;
}

