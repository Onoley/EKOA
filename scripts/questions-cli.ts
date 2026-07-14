import { resolve } from "node:path";

import { checkImportedQuestions } from "../src/features/question-import/check";
import { createQuestionImporter, getImportCheckData, loadValidationContext, resolveEditorialIdentity } from "../src/features/question-import/database";
import { executeImport, ImportExecutionError } from "../src/features/question-import/importer";
import { buildValidationReport, printReport, writeReport, type ImportReport } from "../src/features/question-import/report";
import { validateQuestionRows } from "../src/features/question-import/validation";
import { readQuestionWorkbook } from "../src/features/question-import/workbook";

type Command = "validate" | "import" | "check";
function parseArguments(argv: string[]) {
  const command = argv[0] as Command | undefined;
  if (!command || !["validate", "import", "check"].includes(command)) throw new Error("Commande attendue : validate, import ou check.");
  const fileIndex = argv.indexOf("--file");
  const file = resolve(fileIndex >= 0 && argv[fileIndex + 1] ? argv[fileIndex + 1] : "imports/ekoa_questions.xlsx");
  return { command, file, dryRun: argv.includes("--dry-run") };
}
async function validation(file: string) {
  const rows = await readQuestionWorkbook(file);
  const context = await loadValidationContext();
  return validateQuestionRows(rows, context);
}
async function main() {
  const args = parseArguments(process.argv.slice(2));
  const result = await validation(args.file);
  const base = buildValidationReport(result);
  if (args.command === "check") {
    if (result.errors.length) throw new Error("Le fichier de référence contient des erreurs ; contrôle impossible.");
    const errors = checkImportedQuestions(result.questions, await getImportCheckData());
    if (errors.length) throw new Error(`Contrôle post-import invalide :\n- ${errors.join("\n- ")}`);
    console.log(`Contrôle valide : ${result.questions.length} questions attendues sont présentes et cohérentes.`);
    return;
  }
  const mode = args.command === "validate" ? "validate" : args.dryRun ? "dry-run" : "import";
  const reportPath = resolve(`reports/questions-import-${mode}.json`);
  const report: ImportReport = { ...base, mode };
  if (args.command === "validate" || args.dryRun) {
    await writeReport(reportPath, report); printReport(report); console.log(`Rapport : ${reportPath}`);
    if (result.errors.length) process.exitCode = 1;
    return;
  }
  if (result.errors.length) {
    await writeReport(reportPath, report); printReport(report);
    throw new Error("Import refusé : corrigez toutes les lignes invalides avant de relancer.");
  }
  const identity = await resolveEditorialIdentity();
  try {
    const execution = await executeImport(result.questions, identity, createQuestionImporter());
    Object.assign(report, { imported: execution.imported, skipped: execution.skipped, batchId: execution.batchId });
  } catch (error) {
    if (error instanceof ImportExecutionError) {
      Object.assign(report, { imported: error.partialResult.imported, skipped: error.partialResult.skipped, batchId: error.partialResult.batchId });
      report.errors.push({ row: 0, code: "critical_import_error", message: error.message });
      await writeReport(reportPath, report);
    }
    throw error;
  }
  await writeReport(reportPath, report); printReport(report); console.log(`Rapport : ${reportPath}`);
}
main().catch((error: unknown) => { console.error(error instanceof Error ? error.message : "Erreur inconnue."); process.exitCode = 1; });
