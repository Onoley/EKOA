import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";

describe("contrat SQL Phase 9", () => {
  it("réserve limitation et maintenance au service", async () => {
    const sql = await readFile("supabase/migrations/202607130009_phase_9_hardening.sql", "utf8");
    expect(sql).toContain("alter table public.rate_limit_buckets enable row level security");
    expect(sql).toContain("grant execute on function public.consume_rate_limit(text,text,integer,integer) to service_role");
    expect(sql).toContain("grant execute on function public.run_operational_maintenance(integer) to service_role");
    expect(sql).not.toContain("to authenticated");
  });
});
