import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync("supabase/migrations/202607130004_phase_4_feed.sql", "utf8");

describe("contrat fil et télémétrie de la phase 4", () => {
  it.each(["blocked_users", "verified_account_follows", "feed_impressions", "interaction_events"])("active RLS sur %s", (table) => expect(migration).toContain(`alter table public.${table} enable row level security`));
  it("ne permet aucune écriture directe dans la télémétrie", () => expect(migration).not.toMatch(/grant\s+(insert|update|delete|all)[^;]*public\.(feed_impressions|interaction_events)/i));
  it("réserve la sélection des candidats au service serveur", () => { expect(migration).toContain("grant execute on function public.get_feed_candidates"); expect(migration).toContain("to service_role"); });
  it("limite les événements client aux trois types attendus", () => expect(migration).toContain("requested_type not in ('impression','skip','dwell')"));
  it("remplace l'identité par auth.uid", () => expect(migration).toContain("declare actor uuid:=auth.uid()"));
  it("filtre votes, blocages et âge", () => { expect(migration).toMatch(/not exists\(select 1 from public\.votes/); expect(migration).toMatch(/public\.blocked_users/); expect(migration).toContain("target_min_age"); });
});
