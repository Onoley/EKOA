import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync("supabase/migrations/202607170007_fix_user_submission_limits.sql", "utf8");
const action = readFileSync("src/features/questions/actions.ts", "utf8");

describe("limites réservées aux soumissions utilisateur", () => {
  it("ne compte pas les questions éditoriales dans la limite active", () => {
    expect(migration).toMatch(/author_id=requested_user_id and is_user_submission and status in\('published','limited','under_review'\)/);
  });

  it("ne compte pas les questions éditoriales dans les limites horaire et glissante", () => {
    expect(migration.match(/author_id=requested_user_id and is_user_submission/g)).toHaveLength(5);
    expect(migration).toMatch(/is_user_submission and created_at>=now\(\)-interval '1 hour'/);
    expect(migration).toMatch(/is_user_submission and created_at>=now\(\)-make_interval/);
  });

  it("exempte les publications administrateur de ces limites utilisateur", () => {
    expect(migration.match(/if user_submission and/g)?.length).toBeGreaterThanOrEqual(4);
  });

  it("reste additive et conserve la migration 004 hors du chemin", () => {
    expect(migration.trimStart().startsWith("begin;")).toBe(true);
    expect(migration.trimEnd().endsWith("commit;")).toBe(true);
    expect(migration).not.toMatch(/\b(delete|truncate|drop table|alter table)\b/i);
    expect(migration).not.toContain("202607170004");
  });
});

describe("retour d’erreur de soumission", () => {
  it("explique les validations de base connues", () => {
    for (const code of ["invalid_question", "invalid_options", "duplicate_options", "invalid_age_range", "invalid_category", "invalid_moderation_result", "not_authorized"]) {
      expect(action).toContain(`${code}:`);
    }
  });

  it("retente une erreur d’authentification serveur transitoire", () => {
    expect(action).toContain('error.code==="PGRST303"');
    expect(action.match(/submit_moderated_question/g)).toHaveLength(2);
  });

  it("journalise le code sûr sans exposer de secret", () => {
    expect(action).toContain('code: publishError.code||"database_rejected"');
    expect(action).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
  });
});
