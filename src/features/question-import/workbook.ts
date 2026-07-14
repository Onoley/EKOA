import { access } from "node:fs/promises";

import * as XLSX from "xlsx";

import { QUESTION_HEADERS, type RawQuestionRow } from "./types";

export class WorkbookFormatError extends Error {}

function cellText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "object") {
    if ("text" in value && typeof value.text === "string") return value.text.trim();
    if ("richText" in value && Array.isArray(value.richText)) {
      return value.richText.map((part) => part.text).join("").trim();
    }
    if ("result" in value && value.result !== undefined) return String(value.result).trim();
  }
  return String(value).trim();
}

export async function readQuestionWorkbook(filePath: string): Promise<RawQuestionRow[]> {
  try {
    await access(filePath);
  } catch {
    throw new WorkbookFormatError(`Fichier introuvable : ${filePath}`);
  }

  const workbook = XLSX.readFile(filePath, { cellDates: false, raw: false });
  for (const name of ["Questions", "Categories", "Instructions"]) {
    if (!workbook.SheetNames.includes(name)) throw new WorkbookFormatError(`Feuille obligatoire absente : ${name}`);
  }

  const sheet = workbook.Sheets.Questions;
  if (!sheet) throw new WorkbookFormatError("Feuille obligatoire absente : Questions");
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "", raw: false });
  const headerByColumn = new Map<number, string>();
  for (const [column, value] of (matrix[0] ?? []).entries()) if (cellText(value)) headerByColumn.set(column, cellText(value));

  const present = new Set(headerByColumn.values());
  const missing = QUESTION_HEADERS.filter((header) => !present.has(header));
  if (missing.length) throw new WorkbookFormatError(`Colonnes obligatoires absentes : ${missing.join(", ")}`);
  const unsupportedTags = [...present].filter((header) => /^tag_[4-9][0-9]*$/.test(header));
  if (unsupportedTags.length) throw new WorkbookFormatError(`Plus de trois colonnes de tags : ${unsupportedTags.join(", ")}`);
  const unsupportedOptions = [...present].filter((header) => /^option_(?:[7-9]|[1-9][0-9]+)$/.test(header));
  if (unsupportedOptions.length) throw new WorkbookFormatError(`Plus de six colonnes d’options : ${unsupportedOptions.join(", ")}`);

  const columnByHeader = new Map<string, number>();
  for (const [column, header] of headerByColumn) columnByHeader.set(header, column);
  const rows: RawQuestionRow[] = [];
  for (let rowNumber = 2; rowNumber <= matrix.length; rowNumber += 1) {
    const row = matrix[rowNumber - 1] ?? [];
    const record = Object.fromEntries(QUESTION_HEADERS.map((header) => [
      header,
      cellText(row[columnByHeader.get(header) ?? -1]),
    ])) as RawQuestionRow;
    if (Object.values(record).some(Boolean)) rows.push(record);
  }
  return rows;
}
