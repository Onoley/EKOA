import {
  IMPORT_LINE_STATUSES, QUESTION_FORMATS,
  type ImportLineStatus, type InternalQuestionStatus, type QuestionFormat,
} from "./types";

export type StatusConversion =
  | { action: "import"; status: InternalQuestionStatus }
  | { action: "ignore"; status: null };

export function convertImportStatus(value: string): StatusConversion | null {
  if (!IMPORT_LINE_STATUSES.includes(value as ImportLineStatus)) return null;
  if (value === "ready") return { action: "import", status: "published" };
  if (value === "review") return { action: "import", status: "draft" };
  return { action: "ignore", status: null };
}

export function parseQuestionFormat(value: string): QuestionFormat | null {
  return QUESTION_FORMATS.includes(value as QuestionFormat) ? value as QuestionFormat : null;
}

