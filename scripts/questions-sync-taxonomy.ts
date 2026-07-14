import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { configuredClient } from "../src/features/question-import/database";
import { buildTaxonomySyncPlan, type ExistingTag } from "../src/features/question-import/taxonomy-sync";
import { readControlledWorkbook } from "../src/features/question-import/taxonomy-workbook";

function fileArgument(argv: string[]): string {
  const index = argv.indexOf("--file");
  return resolve(index >= 0 && argv[index + 1] ? argv[index + 1] : "imports/ekoa_questions.xlsx");
}
function sameSet(actual: string[], expected: string[]): boolean {
  return actual.length === expected.length && expected.every((value) => actual.includes(value));
}

async function main() {
  const file = fileArgument(process.argv.slice(2));
  const workbook = await readControlledWorkbook(file);
  const db = configuredClient();
  const [universes, categories, tags, associations, questions] = await Promise.all([
    db.from("universes").select("id,slug").eq("is_active", true),
    db.from("categories").select("id,slug").eq("is_active", true),
    db.from("tags").select("id,slug,name,normalized_name,description,sensitivity,is_featured,is_active"),
    db.from("category_tags").select("category_id,tag_id,display_order,is_featured"),
    db.from("questions").select("*", { count: "exact", head: true }),
  ]);
  for (const result of [universes, categories, tags, associations, questions]) if (result.error) throw new Error(result.error.message);
  if ((questions.count ?? 0) !== 0) throw new Error("Synchronisation refusée : la base contient déjà des questions.");
  if (!sameSet((universes.data ?? []).map((item) => item.slug), workbook.universeSlugs)) throw new Error("Les 7 univers du fichier ne correspondent pas à la base.");
  if (!sameSet((categories.data ?? []).map((item) => item.slug), workbook.categorySlugs)) throw new Error("Les 30 catégories du fichier ne correspondent pas à la base.");
  const categoryById = new Map((categories.data ?? []).map((item) => [item.id, item.slug]));
  const tagById = new Map((tags.data ?? []).map((item) => [item.id, item.slug]));
  const existingTags: ExistingTag[] = (tags.data ?? []).map((tag) => ({
    id: tag.id, slug: tag.slug, name: tag.name, normalizedName: tag.normalized_name,
    description: tag.description, sensitivity: tag.sensitivity, isFeatured: tag.is_featured,
    isActive: tag.is_active, suggestedCategorySlugs: [], displayOrder: 0,
  }));
  const existingAssociationKeys = new Set((associations.data ?? []).map((relation) => `${categoryById.get(relation.category_id)}:${tagById.get(relation.tag_id)}`));
  const plan = buildTaxonomySyncPlan(workbook.tags, workbook.usedPairs, existingTags, existingAssociationKeys);
  const changedTags = [...plan.create, ...plan.update, ...plan.reactivate];
  for (let index = 0; index < changedTags.length; index += 100) {
    const result = await db.from("tags").upsert(changedTags.slice(index, index + 100).map((tag) => ({
      slug: tag.slug, name: tag.name, normalized_name: tag.normalizedName, description: tag.description,
      sensitivity: tag.sensitivity, is_featured: tag.isFeatured, is_active: tag.isActive,
    })), { onConflict: "slug" });
    if (result.error) throw new Error(result.error.message);
  }
  const refreshedTags = await db.from("tags").select("id,slug");
  if (refreshedTags.error) throw new Error(refreshedTags.error.message);
  const categoryIdBySlug = new Map((categories.data ?? []).map((item) => [item.slug, item.id]));
  const tagIdBySlug = new Map((refreshedTags.data ?? []).map((item) => [item.slug, item.id]));
  const maxOrder = new Map<string, number>();
  for (const relation of associations.data ?? []) maxOrder.set(relation.category_id, Math.max(maxOrder.get(relation.category_id) ?? 0, relation.display_order));
  const newRelations = plan.associationKeysToCreate.map((key) => {
    const separator = key.indexOf(":"); const categorySlug = key.slice(0, separator); const tagSlug = key.slice(separator + 1);
    const categoryId = categoryIdBySlug.get(categorySlug); const tagId = tagIdBySlug.get(tagSlug);
    if (!categoryId || !tagId) throw new Error(`Association impossible : ${key}.`);
    const displayOrder = (maxOrder.get(categoryId) ?? 0) + 1; maxOrder.set(categoryId, displayOrder);
    return { category_id: categoryId, tag_id: tagId, display_order: displayOrder, is_featured: false };
  });
  for (let index = 0; index < newRelations.length; index += 100) {
    const result = await db.from("category_tags").insert(newRelations.slice(index, index + 100));
    if (result.error) throw new Error(result.error.message);
  }
  const report = {
    generatedAt: new Date().toISOString(), file, questionsWritten: 0,
    tags: { created: plan.create.length, updated: plan.update.length, reactivated: plan.reactivate.length, unchanged: plan.unchanged.length },
    associations: { uniqueUsedPairs: workbook.usedPairs.length, created: newRelations.length },
  };
  await mkdir(resolve("reports"), { recursive: true });
  await writeFile(resolve("reports/questions-taxonomy-sync.json"), `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
  console.log(JSON.stringify(report, null, 2));
}
main().catch((error: unknown) => { console.error(error instanceof Error ? error.message : "Erreur inconnue."); process.exitCode = 1; });

