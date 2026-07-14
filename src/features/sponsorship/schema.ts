import { z } from "zod";

export const campaignStatusSchema = z.enum(["draft", "active", "paused", "completed", "cancelled"]);
const campaignDateSchema=z.union([z.iso.datetime(),z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/).transform((value)=>`${value}:00.000Z`)]);
export const organisationInputSchema = z.object({ ownerUserId: z.uuid(), legalName: z.string().trim().min(2).max(160) });
export const campaignInputSchema = z.object({
  sponsorId: z.uuid(), questionId: z.uuid(), name: z.string().trim().min(2).max(120), kind: z.enum(["commercial", "public_interest"]),
  startsAt: campaignDateSchema, endsAt: campaignDateSchema, responseTarget: z.coerce.number().int().min(20).max(1_000_000),
  budgetEuros: z.coerce.number().min(0).max(1_000_000), policyConfirmed: z.literal("yes", { error: "Confirmez la revue de politique publicitaire." }),
}).refine((value) => new Date(value.endsAt) > new Date(value.startsAt), { path: ["endsAt"], message: "La fin doit suivre le début." });
export const campaignStatusInputSchema = z.object({ campaignId: z.uuid(), status: campaignStatusSchema, reason: z.string().trim().min(5).max(500) });
export const sponsorshipSchema = z.object({ question_id: z.uuid(), organisation_name: z.string().min(2).max(160) });
export const campaignReportSchema = z.object({ option_text: z.string().nullable(), vote_count: z.number().int().nonnegative().nullable(), percentage: z.number().nonnegative().max(100).nullable(), total_responses: z.number().int().nonnegative(), suppressed: z.boolean() });

export type Sponsorship = z.infer<typeof sponsorshipSchema>;
