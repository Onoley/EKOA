import {describe,expect,it} from "vitest";import {reportInputSchema} from "./schema";
const base={targetType:"question",targetId:"11111111-1111-4111-8111-111111111111",reason:"spam",details:""};
describe("signalement",()=>{it("accepte la taxonomie",()=>expect(reportInputSchema.safeParse(base).success).toBe(true));it("refuse une raison libre",()=>expect(reportInputSchema.safeParse({...base,reason:"désaccord"}).success).toBe(false));it("exige une cible UUID",()=>expect(reportInputSchema.safeParse({...base,targetId:"x"}).success).toBe(false))});
