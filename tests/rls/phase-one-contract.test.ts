import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "supabase/migrations/202607130001_phase_1_identity.sql",
  "utf8",
);

describe("contrat RLS de la phase 1", () => {
  it.each(["profiles", "categories", "category_follows"])(
    "active RLS sur %s",
    (table) => expect(migration).toContain(`alter table public.${table} enable row level security`),
  );

  it("ne permet pas la modification directe des profils", () => {
    expect(migration).not.toMatch(/grant\s+(?:update|all)[^;]*on public\.profiles/i);
  });

  it("réserve l’onboarding à une fonction transactionnelle", () => {
    expect(migration).toContain("create function public.complete_onboarding");
    expect(migration).toContain("security definer");
    expect(migration).toContain("grant execute on function public.complete_onboarding");
  });

  it("limite les profils privés à leur propriétaire", () => {
    expect(migration).toMatch(/profiles_select_own[\s\S]*user_id = auth\.uid\(\)/);
  });
});
