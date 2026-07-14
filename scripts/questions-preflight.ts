import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { configuredClient, resolveEditorialIdentity } from "../src/features/question-import/database";
import { readControlledWorkbook } from "../src/features/question-import/taxonomy-workbook";

async function count(table: string): Promise<number> {
  const result = await configuredClient().from(table).select("*", { count: "exact", head: true });
  if (result.error) throw new Error(result.error.message);
  return result.count ?? 0;
}
async function main() {
  const file = resolve(process.argv[2] ?? "imports/ekoa_questions.xlsx");
  const bytes = await readFile(file);
  const workbook = await readControlledWorkbook(file);
  const dryRun = JSON.parse(await readFile(resolve("reports/questions-import-dry-run.json"), "utf8")) as { errors?: unknown[]; validRows?: number };
  if ((dryRun.errors?.length ?? 0) !== 0 || dryRun.validRows !== workbook.questions.length) throw new Error("Le dernier dry-run n’est pas valide.");
  await resolveEditorialIdentity();
  const db = configuredClient();
  const [universes, categories, tags, relations, counts] = await Promise.all([
    db.from("universes").select("slug").eq("is_active", true),
    db.from("categories").select("slug").eq("is_active", true),
    db.from("tags").select("slug,is_active"),
    db.from("category_tags").select("category_id,tag_id", { count: "exact", head: true }),
    Promise.all(["questions", "question_options", "question_tags", "profiles", "category_follows"].map(count)),
  ]);
  for (const result of [universes, categories, tags, relations]) if (result.error) throw new Error(result.error.message);
  if ((universes.data?.length ?? 0) !== 7 || (categories.data?.length ?? 0) !== 30) throw new Error("Taxonomie 7/30 invalide.");
  const tagState = new Map((tags.data ?? []).map((tag) => [tag.slug, tag.is_active]));
  for (const tag of workbook.tags) if (tagState.get(tag.slug) !== true) throw new Error(`Tag absent ou inactif : ${tag.slug}.`);
  if (counts[0] !== 0 || counts[1] !== 0 || counts[2] !== 0) throw new Error("La base contient déjà des données de question.");
  const report = {
    checkedAt: new Date().toISOString(), fileSha256: createHash("sha256").update(bytes).digest("hex"),
    dryRunErrors: 0, validRows: workbook.questions.length, editorialIdentityVerified: true,
    before: { questions: counts[0], options: counts[1], questionTags: counts[2], profiles: counts[3], categoryFollows: counts[4], categoryTagAssociations: relations.count ?? 0 },
    taxonomy: { universes: 7, categories: 30, controlledTagsInWorkbook: workbook.tags.length },
  };
  await writeFile(resolve("reports/questions-import-preflight.json"), `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
  console.log(JSON.stringify(report, null, 2));
}
main().catch((error: unknown) => { console.error(error instanceof Error ? error.message : "Erreur inconnue."); process.exitCode = 1; });
