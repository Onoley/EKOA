import {z} from "zod";import {genderValues,professionalActivities} from "../onboarding/schema";
const activities=professionalActivities.map(([value])=>value) as [string,...string[]];const genders=genderValues.map(([value])=>value) as [string,...string[]];
export const profileSettingsSchema=z.object({birthYear:z.coerce.number().int().min(new Date().getFullYear()-120,"Vérifiez votre année de naissance.").max(new Date().getFullYear()-18,"Ekoa est réservé aux personnes majeures."),departmentCode:z.string().trim().toUpperCase().regex(/^(0[1-9]|1[0-9]|2[1-9]|[3-8][0-9]|9[0-5]|2A|2B|97[1-6])$/,"Code de département invalide."),professionalActivity:z.enum(activities),gender:z.enum(genders)});
export const verifiedFollowSchema=z.object({userId:z.uuid(),followed:z.boolean()});
export const deletionConfirmationSchema=z.literal("SUPPRIMER",{error:"Saisissez exactement SUPPRIMER pour confirmer."});
