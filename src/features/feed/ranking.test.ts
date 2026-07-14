import { describe, expect, it } from "vitest";
import { diversify, rankCandidates } from "./ranking";
import type { FeedCandidate } from "./schema";

const make = (id: string, overrides: Partial<FeedCandidate> = {}): FeedCandidate => ({ question_id: id, question_text: "Question assez longue ?", author_id: `${id.slice(0,-1)}a`, author_username: "membre", author_verified: false, category_id: `${id.slice(0,-1)}b`, category_name: "Société", published_at: "2026-07-13T10:00:00.000Z", options: [{ id: `${id.slice(0,-1)}c`, text: "Oui" }, { id: `${id.slice(0,-1)}d`, text: "Non" }], vote_count: 10, upvote_count: 2, follow_count: 1, report_count: 0, impression_count: 20, followed_category: false, followed_author: false, initially_followed: false, ...overrides });
const ids = ["00000000-0000-4000-8000-000000000001","00000000-0000-4000-8000-000000000002","00000000-0000-4000-8000-000000000003"];
describe("classement v1", () => {
  it("est déterministe", () => expect(rankCandidates(ids.map((id) => make(id)), new Date("2026-07-13T12:00:00Z"), "seed").map(x=>x.question_id)).toEqual(rankCandidates(ids.map((id) => make(id)), new Date("2026-07-13T12:00:00Z"), "seed").map(x=>x.question_id)));
  it("favorise une catégorie suivie", () => { const ranked=rankCandidates([make(ids[0]),make(ids[1],{followed_category:true})],new Date("2026-07-13T12:00:00Z"),"seed"); expect(ranked[0].question_id).toBe(ids[1]); });
  it("évite deux auteurs consécutifs lorsque possible", () => { const author="10000000-0000-4000-8000-000000000000"; const ranked=ids.map((id,i)=>({ ...make(id), score:3-i, reasons:[], author_id:i<2?author:`${id.slice(0,-1)}a` })); expect(diversify(ranked)[1].author_id).not.toBe(author); });
});
