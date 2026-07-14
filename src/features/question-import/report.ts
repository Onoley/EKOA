import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import type { ValidationResult } from "./types";

export type ImportReport = ReturnType<typeof buildValidationReport> & {
  mode: "validate" | "dry-run" | "import";
  imported?: number;
  skipped?: number;
  batchId?: string;
};

function distribution(values: string[]): Record<string, number> {
  return values.reduce<Record<string, number>>((result, value) => {
    result[value] = (result[value] ?? 0) + 1;
    return result;
  }, {});
}

export function buildValidationReport(result: ValidationResult) {
  const ready = result.questions.filter((question) => question.outcome === "import");
  return {
    generatedAt: new Date().toISOString(),
    totalRows: result.totalRows,
    validRows: result.questions.length,
    readyToImportRows: ready.length,
    rejectedRows: result.questions.filter((question) => question.outcome === "rejected").length,
    invalidRows: new Set(result.errors.map((error) => error.row)).size,
    alreadyImportedRows: result.questions.filter((question) => question.outcome === "skip").length,
    duplicates: result.duplicates,
    conflicts: result.conflicts,
    byCategory: distribution(ready.map((question) => question.categorySlug)),
    bySensitivity: distribution(ready.map((question) => question.sensitivity)),
    byEditorialType: distribution(ready.map((question) => question.editorialType)),
    byQuestionFormat: distribution(ready.map((question) => question.questionFormat)),
    conversions: result.conversions,
    errors: result.errors,
    warnings: result.warnings,
    preview: ready.slice(0, 5).map(({ row, externalId, question, categorySlug, options, tagSlugs, questionFormat, status }) => ({ row, externalId, question, categorySlug, options, tagSlugs, questionFormat, status })),
  };
}

export async function writeReport(path: string, report: ImportReport): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(report, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
}

export function printReport(report: ImportReport): void {
  console.log(`Mode: ${report.mode}`);
  console.log(`Lignes: ${report.totalRows} | valides: ${report.validRows} | prêtes: ${report.readyToImportRows} | invalides: ${report.invalidRows} | rejetées: ${report.rejectedRows} | déjà importées: ${report.alreadyImportedRows}`);
  console.log(`Doublons: ${report.duplicates} | conflits: ${report.conflicts}`);
  if (report.imported !== undefined) console.log(`Importées: ${report.imported} | ignorées: ${report.skipped ?? 0}`);
  for (const error of report.errors) console.error(`Ligne ${error.row}${error.field ? ` [${error.field}]` : ""}: ${error.message}`);
  for (const warning of report.warnings) console.warn(`Avertissement ligne ${warning.row}: ${warning.message}`);
}
