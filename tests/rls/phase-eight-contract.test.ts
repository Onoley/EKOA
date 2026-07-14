import{readFileSync}from"node:fs";import{describe,expect,it}from"vitest";const migration=readFileSync("supabase/migrations/202607130008_phase_8_moderation_admin.sql","utf8");
describe("contrat administration de la phase 8",()=>{
 it.each(["moderation_cases","moderation_actions","audit_log","verified_profiles"])("active RLS sur %s",(table)=>expect(migration).toContain(`alter table public.${table} enable row level security`));
 it("ne donne aucun droit d'écriture direct",()=>expect(migration).not.toMatch(/grant\s+(insert|update|delete|all)[^;]*public\.(moderation_cases|moderation_actions|audit_log|verified_profiles)/i));
 it("distingue modérateur et administrateur",()=>{expect(migration).toContain("role in ('moderator','admin')");expect(migration).toContain("role='admin'")});
 it("réserve suspension, vérification et termes à l'admin",()=>{expect(migration.match(/not public\.is_admin\(\)/g)?.length).toBeGreaterThanOrEqual(3)});
 it("audite état précédent, nouvel état et justification",()=>expect(migration).toMatch(/moderation_actions[\s\S]*previous_state[\s\S]*new_state[\s\S]*reason/));
 it("ne détruit aucun contenu modéré",()=>{expect(migration).not.toMatch(/delete from public\.(questions|comments)/);expect(migration).toContain("status='removed'");expect(migration).toContain("moderation_status='removed'")});
 it("sépare les données publiques et privées de vérification",()=>{const publicFn=migration.match(/create function public\.get_verified_public_details[\s\S]*?\$\$;/)?.[0]??"";expect(publicFn).not.toMatch(/official_website|responsible_owner|private_notes/)});
 it("rend l'audit lisible uniquement par l'admin",()=>expect(migration).toContain("audit_log_admin_read"));
});
