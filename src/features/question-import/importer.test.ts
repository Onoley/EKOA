import { describe, expect, it, vi } from "vitest";

import { validRawRow, validationContext } from "./fixtures";
import { executeImport, ImportExecutionError } from "./importer";
import { validateQuestionRows } from "./validation";

const identity = { authorId: "author", organisationId: null };
const question = validateQuestionRows([validRawRow()], validationContext()).questions[0];

describe("exécution atomique par question", () => {
  it("importe une ligne valide", async () => {
    const importer = vi.fn().mockResolvedValue({ outcome: "imported", question_id: "question-1" });
    const result = await executeImport([question], identity, importer);
    expect(result.imported).toBe(1);
    expect(importer).toHaveBeenCalledOnce();
  });

  it("reste idempotent lorsque la base ignore une ligne", async () => {
    const importer = vi.fn().mockResolvedValue({ outcome: "skipped", question_id: "question-1" });
    expect((await executeImport([question], identity, importer)).skipped).toBe(1);
  });

  it("n’écrit rien pendant la préparation d’un dry-run", () => {
    const importer = vi.fn();
    const result = validateQuestionRows([validRawRow()], validationContext());
    expect(result.questions).toHaveLength(1);
    expect(importer).not.toHaveBeenCalled();
  });

  it("s’arrête proprement sur la première erreur critique", async () => {
    const second = { ...question, externalId: "EKOA-0002", row: 3 };
    const importer = vi.fn().mockResolvedValueOnce({ outcome: "imported", question_id: "question-1" }).mockRejectedValueOnce(new Error("transaction annulée"));
    const execution = executeImport([question, second], identity, importer);
    await expect(execution).rejects.toBeInstanceOf(ImportExecutionError);
    await expect(execution).rejects.toMatchObject({ partialResult: { imported: 1 } });
    expect(importer).toHaveBeenCalledTimes(2);
  });
});
