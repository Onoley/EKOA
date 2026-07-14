import { randomUUID } from "node:crypto";

import type { EditorialIdentity, ValidatedQuestion } from "./types";
import type { ImportOutcome, QuestionImporter } from "./database";

export type ExecutionResult = { batchId: string; imported: number; skipped: number; completedExternalIds: string[] };

export class ImportExecutionError extends Error {
  constructor(message: string, readonly partialResult: ExecutionResult) { super(message); }
}

export async function executeImport(questions: ValidatedQuestion[], identity: EditorialIdentity, importer: QuestionImporter, batchSize = 50): Promise<ExecutionResult> {
  const result: ExecutionResult = { batchId: randomUUID(), imported: 0, skipped: 0, completedExternalIds: [] };
  const pending = questions.filter((question) => question.outcome === "import");
  result.skipped += questions.length - pending.length;
  for (let start = 0; start < pending.length; start += batchSize) {
    for (const question of pending.slice(start, start + batchSize)) {
      let outcome: ImportOutcome;
      try { outcome = await importer(question, identity, result.batchId); }
      catch (error) { throw new ImportExecutionError(error instanceof Error ? error.message : "Erreur d’import inconnue.", result); }
      if (outcome.outcome === "imported") result.imported += 1; else result.skipped += 1;
      result.completedExternalIds.push(question.externalId);
    }
  }
  return result;
}

