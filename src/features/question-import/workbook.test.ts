import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import ExcelJS from "exceljs";
import { afterEach, describe, expect, it } from "vitest";

import { QUESTION_HEADERS } from "./types";
import { readQuestionWorkbook, WorkbookFormatError } from "./workbook";

const directories: string[] = [];
async function workbook(headers: string[], sheets = ["Questions", "Categories", "Instructions"]) {
  const directory = await mkdtemp(join(tmpdir(), "ekoa-import-")); directories.push(directory);
  const path = join(directory, "fixture.xlsx");
  const book = new ExcelJS.Workbook();
  for (const name of sheets) book.addWorksheet(name);
  book.getWorksheet("Questions")?.addRow(headers);
  await book.xlsx.writeFile(path);
  return path;
}
afterEach(async () => { await Promise.all(directories.splice(0).map((path) => rm(path, { recursive: true, force: true }))); });

describe("lecture du classeur", () => {
  it("refuse un fichier absent", async () => await expect(readQuestionWorkbook("/tmp/ekoa-absent.xlsx")).rejects.toBeInstanceOf(WorkbookFormatError));
  it("refuse une feuille absente", async () => await expect(readQuestionWorkbook(await workbook([...QUESTION_HEADERS], ["Questions", "Categories"]))).rejects.toThrow("Instructions"));
  it("refuse une colonne absente", async () => await expect(readQuestionWorkbook(await workbook(QUESTION_HEADERS.filter((header) => header !== "external_id")))).rejects.toThrow("external_id"));
  it("refuse une quatrième colonne de tag", async () => await expect(readQuestionWorkbook(await workbook([...QUESTION_HEADERS, "tag_4"]))).rejects.toThrow("Plus de trois"));
  it("refuse une septième option", async () => await expect(readQuestionWorkbook(await workbook([...QUESTION_HEADERS, "option_7"]))).rejects.toThrow("Plus de six"));
});
