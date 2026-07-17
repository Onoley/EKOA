import { z } from "zod";

export const ALGORITHM_VERSION = 1;
export const feedTypeSchema = z.enum(["for_you", "following"]);
export const categorySlugSchema = z.string().regex(/^[a-z0-9-]+$/).max(80);
export const optionSchema = z.object({ id: z.uuid(), text: z.string() });
export const candidateSchema = z.object({
  question_id: z.uuid(), question_text: z.string(), author_id: z.uuid(), author_username: z.string().nullable().transform((value)=>value??"membre supprimé"), author_verified: z.boolean(),
  category_id: z.uuid(), category_name: z.string(), published_at: z.iso.datetime({ offset: true }), options: z.array(optionSchema).min(2).max(6),
  vote_count: z.number().int().nonnegative(), upvote_count: z.number().int().nonnegative(), follow_count: z.number().int().nonnegative(),
  report_count: z.number().int().nonnegative(), impression_count: z.number().int().nonnegative(), followed_category: z.boolean(), followed_author: z.boolean(), initially_followed: z.boolean(),
});
export type FeedCandidate = z.infer<typeof candidateSchema>;
export type FeedType = z.infer<typeof feedTypeSchema>;
export const feedItemSchema = candidateSchema.pick({ question_id: true, question_text: true, author_id: true, author_username: true, author_verified: true, category_id: true, category_name: true, published_at: true, options: true, upvote_count: true, initially_followed: true }).extend({ author_is_admin:z.boolean(),admin_featured:z.boolean(),initially_upvoted: z.boolean(), sponsored_by:z.string().min(2).max(160).nullable() });
export type FeedItem = z.infer<typeof feedItemSchema>;
export const eventSchema = z.object({
  eventId: z.uuid(), eventType: z.enum(["impression", "skip", "dwell"]), questionId: z.uuid(), impressionId: z.uuid(),
  feed: feedTypeSchema, algorithmVersion: z.literal(ALGORITHM_VERSION), rank: z.number().int().min(0).max(100), requestId: z.uuid(),
  occurredAt: z.iso.datetime(), dwellMs: z.number().int().min(0).max(300000).optional(),
}).strict().superRefine((value, context) => { if (value.eventType === "dwell" && value.dwellMs === undefined) context.addIssue({ code: "custom", message: "Durée requise", path: ["dwellMs"] }); });
