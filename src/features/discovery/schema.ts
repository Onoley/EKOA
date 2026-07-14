import { z } from "zod";

export const discoveryModeSchema = z.enum(["search", "recent", "trending"]);
export const discoveryQuerySchema = z.object({
  q: z.string().trim().max(100, "La recherche est limitée à 100 caractères.").optional().default(""),
  category: z.string().regex(/^[a-z0-9-]+$/).max(80).optional(),
  cursor: z.string().max(2048).optional(),
  mode: z.enum(["recent", "trending"]).optional(),
});
export const discoveryResultSchema = z.object({
  question_id: z.uuid(), question_text: z.string(), category_slug: z.string(), category_name: z.string(),
  author_username: z.string().nullable().transform((value)=>value??"membre supprimé"), author_verified: z.boolean(), published_at: z.iso.datetime({ offset: true }), tags: z.array(z.string()), sponsored_by:z.string().min(2).max(160).nullable(),
});
export type DiscoveryResult = z.infer<typeof discoveryResultSchema>;
