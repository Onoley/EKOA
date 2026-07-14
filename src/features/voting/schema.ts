import { z } from "zod";

export const voteInputSchema = z.object({ questionId: z.uuid(), optionId: z.uuid() });
export const toggleInputSchema = z.object({ questionId: z.uuid(), enabled: z.boolean() });
export const resultRowSchema = z.object({
  option_id: z.uuid(), option_text: z.string(), option_position: z.number().int(),
  option_vote_count: z.number().int().nonnegative(), total_vote_count: z.number().int().positive(),
  percentage: z.coerce.number().min(0).max(100), is_selected: z.boolean(),
  question_upvote_count: z.number().int().nonnegative(), is_upvoted: z.boolean(), is_followed: z.boolean(),
});
export const resultsSchema = z.array(resultRowSchema).min(2).max(6);
export type ResultRow = z.infer<typeof resultRowSchema>;
