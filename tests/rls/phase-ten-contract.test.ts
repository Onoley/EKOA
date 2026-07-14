import { readFile } from "node:fs/promises";
import { describe,expect,it } from "vitest";

describe("contrat sponsoring Phase 10",()=>{
 it("interdit politique et ciblage sensible",async()=>{const sql=await readFile("supabase/migrations/202607130010_phase_10_sponsorship.sql","utf8");expect(sql).toContain("category_slug='politique'");expect(sql).toContain("political_sponsorship_forbidden");for(const field of ["gender","department_code","professional_activity","option_id","user_id uuid[]"])expect(sql).not.toContain(`requested_${field}`)});
 it("réserve les tables et projette seulement des agrégats seuilés",async()=>{const sql=await readFile("supabase/migrations/202607130010_phase_10_sponsorship.sql","utf8");expect(sql).toContain("revoke all on public.sponsor_organisations,public.sponsor_campaigns from anon,authenticated");expect(sql).toContain("if total<20");expect(sql).not.toContain("returns table(user_id");expect(sql).toContain("insert into public.audit_log")});
});
