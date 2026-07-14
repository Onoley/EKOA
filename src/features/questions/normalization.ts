export function normalizeQuestionText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("fr")
    .replace(/[’']/g, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function answerOverlap(left: string[], right: string[]) {
  const a = new Set(left.map(normalizeQuestionText));
  const b = new Set(right.map(normalizeQuestionText));
  const overlap = [...a].filter((value) => b.has(value)).length;
  return overlap / Math.max(a.size, b.size, 1);
}
