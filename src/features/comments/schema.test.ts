import {describe,expect,it} from "vitest";
import {commentInputSchema,commentSchema} from "./schema";
const questionId="11111111-1111-4111-8111-111111111111";
describe("commentaires",()=>{
  it("accepte un texte court",()=>expect(commentInputSchema.safeParse({questionId,body:"Je partage ce point de vue."}).success).toBe(true));
  it("refuse plus de 300 caractères",()=>expect(commentInputSchema.safeParse({questionId,body:"x".repeat(301)}).success).toBe(false));
  it.each(["https://example.com","moi@example.com","06 12 34 56 78","@contact"])("refuse la coordonnée %s",(body)=>expect(commentInputSchema.safeParse({questionId,body}).success).toBe(false));
});
describe("réponse commentaire",()=>{
  it("accepte une date PostgreSQL avec un décalage UTC",()=>expect(commentSchema.safeParse({comment_id:"00000000-0000-4000-8000-000000000001",body:"Un commentaire valide.",author_username:"membre",author_verified:false,created_at:"2026-07-13T21:30:00+00:00",upvote_count:0,is_upvoted:false}).success).toBe(true));
});
