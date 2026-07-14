import{readFileSync}from"node:fs";import{describe,expect,it}from"vitest";
const migration=readFileSync("supabase/migrations/202607130006_phase_6_comments_reports.sql","utf8");
describe("contrat commentaires et signalements de la phase 6",()=>{
 it.each(["comments","reports"])("active RLS sur %s",(table)=>expect(migration).toContain(`alter table public.${table} enable row level security`));
 it("interdit les écritures directes",()=>expect(migration).not.toMatch(/grant\s+(insert|update|delete|all)[^;]*public\.(comments|reports)/i));
 it("exige un vote pour commenter",()=>expect(migration).toMatch(/create function public\.create_comment[\s\S]*public\.votes[\s\S]*vote_required/));
 it("borne et filtre le contenu",()=>{expect(migration).toContain("char_length(clean_body) not between 1 and 300");expect(migration).toContain("contact_details");expect(migration).toContain("question_forbidden_terms")});
 it("impose exactement une cible de signalement",()=>expect(migration).toContain("constraint reports_exact_target"));
 it("rend les signalements actifs idempotents",()=>{expect(migration).toContain("reports_active_question_key");expect(migration).toContain("reports_active_comment_key")});
 it("cache les commentaires modérés aux membres ordinaires",()=>expect(migration).toMatch(/comments_visible_or_moderator[\s\S]*moderation_status='visible'[\s\S]*role in \('moderator','admin'\)/));
});
