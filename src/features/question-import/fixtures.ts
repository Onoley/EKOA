import type { RawQuestionRow, ValidationContext } from "./types";

export function validRawRow(overrides: Partial<RawQuestionRow> = {}): RawQuestionRow {
  return {
    external_id: "EKOA-0001", universe_slug: "societe", category_slug: "actualite",
    question: "Cette question éditoriale est-elle suffisamment claire ?",
    option_1: "Oui", option_2: "Non", option_3: "Sans opinion", option_4: "", option_5: "", option_6: "",
    tag_1: "democratie", tag_2: "", tag_3: "", minimum_age: "18", maximum_age: "80",
    sensitivity: "low", editorial_type: "opinion", publication_priority: "50", status: "ready", editorial_note: "Fixture.",
    ...overrides,
  };
}

export function validationContext(): ValidationContext {
  return {
    taxonomy: {
      universes: new Map([["societe", { id: "universe-1" }], ["culture", { id: "universe-2" }]]),
      categories: new Map([["actualite", { id: "category-1", universeSlug: "societe" }]]),
      tags: new Map([["democratie", { id: "tag-1", active: true }], ["inactif", { id: "tag-2", active: false }]]),
      categoryTags: new Set(["category-1:tag-1"]),
    },
    existingQuestions: [], forbiddenTerms: ["contenu interdit"], questionMaxLength: 180, optionMaxLength: 80,
  };
}
