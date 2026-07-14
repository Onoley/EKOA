export const QUESTION_HEADERS = [
  "external_id", "universe_slug", "category_slug", "question",
  "option_1", "option_2", "option_3", "option_4", "option_5", "option_6",
  "tag_1", "tag_2", "tag_3", "minimum_age", "maximum_age", "sensitivity",
  "editorial_type", "publication_priority", "status", "editorial_note",
] as const;

export const SENSITIVITIES = ["low", "medium", "high"] as const;
export const EDITORIAL_TYPES = ["evergreen", "topical", "debate", "experience", "prediction"] as const;
export const QUESTION_FORMATS = ["opinion", "projection", "regulation", "comportement", "dilemme"] as const;
export const IMPORT_LINE_STATUSES = ["ready", "review", "rejected"] as const;
export const INTERNAL_QUESTION_STATUSES = ["draft", "published"] as const;

export type Sensitivity = (typeof SENSITIVITIES)[number];
export type EditorialType = (typeof EDITORIAL_TYPES)[number];
export type QuestionFormat = (typeof QUESTION_FORMATS)[number];
export type ImportLineStatus = (typeof IMPORT_LINE_STATUSES)[number];
export type InternalQuestionStatus = (typeof INTERNAL_QUESTION_STATUSES)[number];
export type QuestionHeader = (typeof QUESTION_HEADERS)[number];
export type RawQuestionRow = Record<QuestionHeader, string>;

export type TaxonomyReference = {
  universes: Map<string, { id: string }>;
  categories: Map<string, { id: string; universeSlug: string }>;
  tags: Map<string, { id: string; active: boolean }>;
  categoryTags: Set<string>;
};

export type ExistingQuestion = {
  externalId: string | null;
  contentHash: string | null;
  normalizedText: string;
};

export type ValidationContext = {
  taxonomy: TaxonomyReference;
  existingQuestions: ExistingQuestion[];
  forbiddenTerms: string[];
  questionMaxLength: number;
  optionMaxLength: number;
};

export type ImportIssue = {
  row: number;
  field?: string;
  code: string;
  message: string;
};

export type ValidatedQuestion = {
  row: number;
  externalId: string;
  contentHash: string;
  universeSlug: string;
  categorySlug: string;
  categoryId: string;
  question: string;
  normalizedQuestion: string;
  options: string[];
  tagSlugs: string[];
  tagIds: string[];
  minimumAge: number | null;
  maximumAge: number | null;
  sensitivity: Sensitivity;
  editorialType: EditorialType;
  questionFormat: QuestionFormat;
  importLineStatus: ImportLineStatus;
  publicationPriority: number;
  status: InternalQuestionStatus;
  editorialNote: string;
  outcome: "import" | "skip" | "rejected";
};

export type ValidationResult = {
  totalRows: number;
  questions: ValidatedQuestion[];
  errors: ImportIssue[];
  warnings: ImportIssue[];
  duplicates: number;
  conflicts: number;
  conversions: { row: number; sourceStatus: ImportLineStatus; internalStatus: InternalQuestionStatus | null; questionFormat: QuestionFormat }[];
};

export type EditorialIdentity = {
  authorId: string;
  organisationId: string | null;
};
