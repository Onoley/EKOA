import{readFileSync}from"node:fs";import{describe,expect,it}from"vitest";
const migration=readFileSync("supabase/migrations/202607170001_admin_editorial_controls.sql","utf8");
describe("contrôles éditoriaux administrateur",()=>{
 it("réserve chaque action à is_admin",()=>{expect(migration.match(/not public\.is_admin\(\)/g)?.length).toBeGreaterThanOrEqual(2)});
 it("audite retrait, restauration, mise en avant et certification",()=>{expect(migration).toContain("insert into public.audit_log");expect(migration).toContain("admin_question_");expect(migration).toContain("quick_verify_account")});
 it("retire sans détruire le contenu",()=>{expect(migration).toContain("status='removed'");expect(migration).not.toMatch(/delete from public\.questions/)});
 it("limite automatiquement la mise en avant admin à 48 heures",()=>{expect(migration).toContain("interval '48 hours'");expect(migration).toContain("publication_priority:=100")});
 it("n'accorde aucune écriture directe aux utilisateurs",()=>expect(migration).not.toMatch(/grant\s+(insert|update|delete|all)\s+on\s+public\.questions/i));
});
