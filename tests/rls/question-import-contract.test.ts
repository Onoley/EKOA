import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const migration = readFileSync(join(process.cwd(), "supabase/migrations/202607140002_question_editorial_import.sql"), "utf8");

describe("contrat SQL de l’import éditorial", () => {
  it("garantit l’unicité de l’identifiant externe", () => expect(migration).toContain("unique index questions_external_id_key"));
  it("réserve la fonction d’import au service role", () => {
    expect(migration).toContain("auth.role() <> 'service_role'");
    expect(migration).toContain("to service_role");
    expect(migration).toContain("from public, anon, authenticated");
  });
  it("importe options et tags dans la même transaction", () => {
    expect(migration).toContain("insert into public.question_options");
    expect(migration).toContain("insert into public.question_tags");
  });
  it("sépare format de question et temporalité éditoriale", () => {
    expect(migration).toContain("create type public.question_format");
    expect(migration).toContain("requested_question_format public.question_format");
  });
});
