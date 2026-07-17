import{z}from"zod";
export const moderationActions=z.enum(["no_action","limit_question","remove_question","restore_question","hide_comment","remove_comment","restore_comment"]);
export const moderationInputSchema=z.object({reportId:z.uuid(),action:moderationActions,reason:z.string().trim().min(5,"Précisez la justification.").max(500)});
export const suspensionSchema=z.object({userId:z.uuid(),suspended:z.boolean(),reason:z.string().trim().min(5).max(500)});
export const verificationSchema=z.object({userId:z.uuid(),status:z.enum(["pending","verified","rejected"]),organisationType:z.string().trim().min(2).max(80),organisationName:z.string().trim().min(2).max(120),publicDescription:z.string().trim().max(500),officialWebsite:z.union([z.url("URL invalide."),z.literal("")]),responsibleOwner:z.string().trim().max(200),privateNotes:z.string().trim().max(1000)});
export const forbiddenTermSchema=z.object({term:z.string().trim().min(2).max(80),severity:z.coerce.number().int().min(1).max(3),active:z.boolean()});
export const accountSearchSchema=z.string().trim().regex(/^[A-Za-z0-9_]{3,24}$/);
export const directQuestionActionSchema=z.object({questionId:z.uuid(),action:z.enum(["remove","restore","feature","unfeature"]),reason:z.string().trim().min(5,"Précisez la justification.").max(500)});
export const quickVerificationSchema=z.object({userId:z.uuid(),verified:z.boolean()});
