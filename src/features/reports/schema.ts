import {z} from "zod";
export const reportReasons=[["spam","Spam"],["harassment","Harcèlement"],["hate","Propos haineux"],["sexual_content","Contenu sexuel"],["violence","Violence"],["misinformation","Information trompeuse"],["personal_information","Information personnelle"],["other","Autre"]] as const;
const reasonValues=reportReasons.map(([value])=>value) as [string,...string[]];
export const reportInputSchema=z.object({targetType:z.enum(["question","comment"]),targetId:z.uuid(),reason:z.enum(reasonValues),details:z.string().trim().max(500,"Le détail est limité à 500 caractères.")});
