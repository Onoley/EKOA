import type { ValidatedQuestion } from "./types";

type CheckData = {
  questions: Array<Record<string, unknown>>;
  options: Array<{ question_id: string; normalized_text: string }>;
  questionTags: Array<{ question_id: string; tag_id: string }>;
  categories: Array<{ id: string; slug: string }>;
};

export function checkImportedQuestions(expected: ValidatedQuestion[], data: CheckData): string[] {
  const errors: string[] = [];
  const expectedIds = new Set(expected.map((question) => question.externalId));
  const imported = data.questions.filter((question) => typeof question.external_id === "string" && expectedIds.has(question.external_id));
  if (imported.length !== expectedIds.size) errors.push(`Nombre de questions incorrect : ${imported.length}/${expectedIds.size}.`);
  const ids = new Set(imported.map((question) => String(question.id)));
  const externalIds = imported.map((question) => String(question.external_id));
  if (new Set(externalIds).size !== externalIds.length) errors.push("external_id dupliqué.");
  if (imported.some((question) => !question.category_id)) errors.push("Question sans catégorie.");
  const optionsByQuestion = new Map<string, string[]>();
  for (const option of data.options) if (ids.has(option.question_id)) optionsByQuestion.set(option.question_id, [...(optionsByQuestion.get(option.question_id) ?? []), option.normalized_text]);
  for (const id of ids) {
    const options = optionsByQuestion.get(id) ?? [];
    if (options.length < 2 || options.length > 6) errors.push(`Question ${id} avec ${options.length} options.`);
    if (new Set(options).size !== options.length) errors.push(`Options dupliquées pour ${id}.`);
  }
  const tagsByQuestion = new Map<string, number>();
  for (const relation of data.questionTags) if (ids.has(relation.question_id)) tagsByQuestion.set(relation.question_id, (tagsByQuestion.get(relation.question_id) ?? 0) + 1);
  for (const [id, count] of tagsByQuestion) if (count > 3) errors.push(`Question ${id} avec plus de trois tags.`);
  const categorySlugById = new Map(data.categories.map((category) => [category.id, category.slug]));
  const actualCategories = new Set(imported.map((question) => categorySlugById.get(String(question.category_id))));
  for (const category of new Set(expected.map((question) => question.categorySlug))) if (!actualCategories.has(category)) errors.push(`Catégorie attendue absente : ${category}.`);
  const allQuestionIds = new Set(data.questions.map((question) => String(question.id)));
  if (data.options.some((option) => !allQuestionIds.has(option.question_id))) errors.push("Option orpheline détectée.");
  if (data.questionTags.some((relation) => !allQuestionIds.has(relation.question_id))) errors.push("Association de tag orpheline détectée.");
  return errors;
}

