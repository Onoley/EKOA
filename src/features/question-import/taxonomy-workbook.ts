import { access } from "node:fs/promises";

import * as XLSX from "xlsx";
import { z } from "zod";

import type { RawQuestionRow, Sensitivity } from "./types";
import { QUESTION_HEADERS } from "./types";

const slug = z.string().regex(/^[a-z0-9-]+$/);
const booleanCell = z.enum(["TRUE", "FALSE"]).transform((value) => value === "TRUE");
const tagSchema = z.object({
  slug,
  name: z.string().min(1).max(80),
  normalized_name: z.string().min(1).max(80),
  description: z.string().max(500),
  sensitivity_level: z.enum(["low", "medium", "high"]),
  is_featured: booleanCell,
  is_active: booleanCell,
  suggested_category_slugs: z.string(),
  display_order: z.coerce.number().int().positive(),
});

export type WorkbookTag = {
  slug: string; name: string; normalizedName: string; description: string;
  sensitivity: Sensitivity; isFeatured: boolean; isActive: boolean;
  suggestedCategorySlugs: string[]; displayOrder: number;
};

export type ControlledWorkbook = {
  questions: RawQuestionRow[];
  universeSlugs: string[];
  categorySlugs: string[];
  tags: WorkbookTag[];
  usedPairs: Array<{ categorySlug: string; tagSlug: string }>;
};

function rows(sheet: XLSX.WorkSheet | undefined): Array<Record<string, string>> {
  if (!sheet) return [];
  return XLSX.utils.sheet_to_json(sheet, { defval: "", raw: false });
}

export async function readControlledWorkbook(filePath: string): Promise<ControlledWorkbook> {
  await access(filePath);
  const workbook = XLSX.readFile(filePath, { raw: false });
  for (const name of ["Questions", "Categories", "Universes", "Tags", "Instructions"]) {
    if (!workbook.SheetNames.includes(name)) throw new Error(`Feuille obligatoire absente : ${name}`);
  }
  const questionRows = rows(workbook.Sheets.Questions);
  const questionHeaders = new Set(Object.keys(questionRows[0] ?? {}));
  const missing = QUESTION_HEADERS.filter((header) => !questionHeaders.has(header));
  if (missing.length) throw new Error(`Colonnes Questions absentes : ${missing.join(", ")}`);
  const questions = questionRows.map((row) => Object.fromEntries(QUESTION_HEADERS.map((header) => [header, String(row[header] ?? "").trim()])) as RawQuestionRow);
  const universeSlugs = rows(workbook.Sheets.Universes).map((row) => row.universe_slug?.trim());
  const categorySlugs = rows(workbook.Sheets.Categories).map((row) => row.category_slug?.trim());
  if (universeSlugs.length !== 7 || new Set(universeSlugs).size !== 7) throw new Error("La feuille Universes doit contenir 7 slugs uniques.");
  if (categorySlugs.length !== 30 || new Set(categorySlugs).size !== 30) throw new Error("La feuille Categories doit contenir 30 slugs uniques.");
  const tags = rows(workbook.Sheets.Tags).map((row, index) => {
    const parsed = tagSchema.safeParse(row);
    if (!parsed.success) throw new Error(`Feuille Tags, ligne ${index + 2} invalide : ${z.prettifyError(parsed.error)}`);
    return {
      slug: parsed.data.slug, name: parsed.data.name, normalizedName: parsed.data.normalized_name,
      description: parsed.data.description, sensitivity: parsed.data.sensitivity_level,
      isFeatured: parsed.data.is_featured, isActive: parsed.data.is_active,
      suggestedCategorySlugs: parsed.data.suggested_category_slugs.split(",").map((value) => value.trim()).filter(Boolean),
      displayOrder: parsed.data.display_order,
    };
  });
  if (new Set(tags.map((tag) => tag.slug)).size !== tags.length) throw new Error("Slug dupliqué dans la feuille Tags.");
  const categorySet = new Set(categorySlugs);
  for (const tag of tags) for (const category of tag.suggestedCategorySlugs) if (!categorySet.has(category)) throw new Error(`Catégorie suggérée inconnue pour ${tag.slug} : ${category}.`);
  const tagSet = new Set(tags.map((tag) => tag.slug));
  const usedPairKeys = new Set<string>();
  for (const [index, question] of questions.entries()) {
    if (!categorySet.has(question.category_slug)) throw new Error(`Catégorie inconnue ligne ${index + 2} : ${question.category_slug}.`);
    for (const tag of [question.tag_1, question.tag_2, question.tag_3].filter(Boolean)) {
      if (!tagSet.has(tag)) throw new Error(`Tag absent de la feuille Tags ligne ${index + 2} : ${tag}.`);
      usedPairKeys.add(`${question.category_slug}:${tag}`);
    }
  }
  return {
    questions, universeSlugs, categorySlugs, tags,
    usedPairs: [...usedPairKeys].sort().map((key) => { const separator = key.indexOf(":"); return { categorySlug: key.slice(0, separator), tagSlug: key.slice(separator + 1) }; }),
  };
}

