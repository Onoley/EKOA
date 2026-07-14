import { z } from "zod";

const contactPattern=/(https?:\/\/|www\.|[\w.%+-]+@[\w.-]+\.[a-z]{2,}|\+?\d[\d .-]{7,}|@[a-z0-9_]{2,})/i;
export const commentInputSchema=z.object({questionId:z.uuid(),body:z.string().trim().min(1,"Écrivez un commentaire.").max(300,"Le commentaire est limité à 300 caractères.").refine((value)=>!contactPattern.test(value),"Les liens et coordonnées ne sont pas autorisés.")});
export const commentSchema=z.object({comment_id:z.uuid(),body:z.string().max(300),author_username:z.string().nullable().transform((value)=>value??"membre supprimé"),author_verified:z.boolean(),created_at:z.iso.datetime({offset:true}),upvote_count:z.number().int().nonnegative(),is_upvoted:z.boolean()});
export const commentUpvoteResponseSchema=z.object({is_upvoted:z.boolean(),upvote_count:z.number().int().nonnegative()});
export type CommentRow=z.infer<typeof commentSchema>;
