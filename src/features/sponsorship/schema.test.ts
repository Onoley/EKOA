import { describe, expect, it } from "vitest";
import { campaignInputSchema } from "./schema";

const valid={sponsorId:"00000000-0000-4000-8000-000000000001",questionId:"00000000-0000-4000-8000-000000000002",name:"Campagne mobilité",kind:"commercial",startsAt:"2026-08-01T00:00:00.000Z",endsAt:"2026-09-01T00:00:00.000Z",responseTarget:"100",budgetEuros:"500",policyConfirmed:"yes"};
describe("campagne sponsorisée",()=>{
 it("exige l’attestation de politique",()=>expect(campaignInputSchema.safeParse({...valid,policyConfirmed:"no"}).success).toBe(false));
 it("n’accepte aucun type politique",()=>expect(campaignInputSchema.safeParse({...valid,kind:"political"}).success).toBe(false));
 it("valide dates et budget",()=>expect(campaignInputSchema.safeParse(valid).success).toBe(true));
});
