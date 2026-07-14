import { readFileSync } from "node:fs";
import { describe,expect,it } from "vitest";

const migration=readFileSync("supabase/migrations/202607130005_phase_5_discovery.sql","utf8");
describe("contrat Explorer de la phase 5",()=>{
  it("ajoute les index de recherche",()=>{expect(migration).toContain("questions_text_fts_idx");expect(migration).toContain("tags_name_trgm_idx");expect(migration).toContain("profiles_username_trgm_idx");});
  it("réserve la fonction au serveur",()=>{expect(migration).toContain("revoke all on function public.discover_questions");expect(migration).toMatch(/grant execute on function public\.discover_questions[\s\S]*to service_role/);});
  it("filtre statut, modération, âge et blocages",()=>{expect(migration).toContain("q.status='published'");expect(migration).toContain("q.moderation_status in ('clear','approved')");expect(migration).toContain("target_min_age");expect(migration).toContain("public.blocked_users");});
  it("limite les comptes recherchés aux vérifiés",()=>expect(migration).toContain("p.account_type='verified' and lower(p.username)"));
  it("calcule les tendances sur sept jours",()=>{expect(migration.match(/interval '7 days'/g)).toHaveLength(3);expect(migration).toContain("report_count*3");});
});
