import { z } from "zod";

const cell = z.string().max(5_000);

export const rawQuestionRowSchema = z.object({
  external_id: cell, universe_slug: cell, category_slug: cell, question: cell,
  option_1: cell, option_2: cell, option_3: cell, option_4: cell, option_5: cell, option_6: cell,
  tag_1: cell, tag_2: cell, tag_3: cell, minimum_age: cell, maximum_age: cell,
  sensitivity: cell, editorial_type: cell, publication_priority: cell, status: cell,
  editorial_note: cell,
}).strict();

