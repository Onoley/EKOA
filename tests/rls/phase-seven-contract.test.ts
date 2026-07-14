import{readFileSync}from"node:fs";import{describe,expect,it}from"vitest";
const migration=readFileSync("supabase/migrations/202607130007_phase_7_profile_lifecycle.sql","utf8");
describe("contrat profil et cycle de vie de la phase 7",()=>{
 it.each(["account_deletion_requests","account_lifecycle_audit"])("active RLS sur %s",(table)=>expect(migration).toContain(`alter table public.${table} enable row level security`));
 it("ne permet aucune écriture directe sur le cycle de vie",()=>expect(migration).not.toMatch(/grant\s+(insert|update|delete|all)[^;]*public\.(account_deletion_requests|account_lifecycle_audit)/i));
 it("réserve l'anonymisation au service serveur",()=>expect(migration).toMatch(/grant execute on function public\.anonymize_requested_account\(uuid\) to service_role/));
 it("exige une confirmation explicite",()=>expect(migration).toContain("requested_confirmation<>'SUPPRIMER'"));
 it("interdit le suivi des comptes ordinaires",()=>expect(migration).toMatch(/set_verified_account_follow[\s\S]*account_type='verified'/));
 it("efface les données privées mais conserve les votes",()=>{expect(migration).toMatch(/update public\.profiles set username=null[\s\S]*birth_year=null/);expect(migration).not.toMatch(/delete from public\.votes/)});
 it("retire les événements et suivis non nécessaires",()=>{expect(migration).toContain("delete from public.interaction_events");expect(migration).toContain("delete from public.question_follows")});
 it("n'expose aucun champ démographique dans le profil public",()=>{const fn=migration.match(/create function public\.get_public_profile[\s\S]*?\$\$;/)?.[0]??"";expect(fn).not.toMatch(/birth_year|department_code|professional_activity|gender/)});
});
