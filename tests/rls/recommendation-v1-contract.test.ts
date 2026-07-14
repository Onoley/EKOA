import { readFileSync } from "node:fs";
import { describe,expect,it } from "vitest";
const migration=readFileSync("supabase/migrations/202607140003_recommendation_v1.sql","utf8");
describe("contrat recommandation V1",()=>{
  it.each(["feed_sessions","feed_reservations","user_question_controls"])("active RLS sur %s",table=>expect(migration).toContain(`alter table public.${table} enable row level security`));
  it("ne donne aucun accès direct au navigateur",()=>expect(migration).not.toMatch(/grant\s+(select|insert|update|delete|all)[^;]*public\.(feed_sessions|feed_reservations|user_question_controls)/i));
  it("réserve les RPC au service role",()=>{expect(migration).toContain("get_recommendation_candidates_v1");expect(migration).toContain("reserve_feed_items_v1");expect(migration).toContain("to service_role")});
  it("borne candidats et réservations",()=>{expect(migration).toContain("least(greatest(requested_limit,1),500)");expect(migration).toContain("jsonb_array_length(requested_items)>20")});
  it("exclut votes, contrôles, signalements, blocages, âge et réservations",()=>{for(const fragment of ["public.votes","public.user_question_controls","public.reports","public.blocked_users","target_min_age","public.feed_reservations"])expect(migration).toContain(fragment)});
  it("rend réservation idempotente dans une session",()=>{expect(migration).toContain("unique(session_id,question_id)");expect(migration).toContain("for update")});
  it("n’enregistre la décision qu’à l’impression réelle",()=>expect(migration).toContain("feed_impressions_attach_ranking"));
});
