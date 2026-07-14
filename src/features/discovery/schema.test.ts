import { describe,expect,it } from "vitest";
import { discoveryQuerySchema, discoveryResultSchema } from "./schema";

describe("recherche Explorer",()=>{
  it("normalise les espaces",()=>expect(discoveryQuerySchema.parse({q:"  santé  "}).q).toBe("santé"));
  it("refuse une catégorie qui n'est pas un slug",()=>expect(discoveryQuerySchema.safeParse({category:"Santé !"}).success).toBe(false));
  it("limite la longueur",()=>expect(discoveryQuerySchema.safeParse({q:"x".repeat(101)}).success).toBe(false));
  it("accepte les dates PostgreSQL avec un décalage UTC",()=>expect(discoveryResultSchema.safeParse({question_id:"00000000-0000-4000-8000-000000000001",question_text:"Une question ?",category_slug:"societe",category_name:"Société",author_username:"membre",author_verified:false,published_at:"2026-07-13T18:00:00+00:00",tags:[],sponsored_by:null}).success).toBe(true));
});
