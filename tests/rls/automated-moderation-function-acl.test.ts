import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "supabase/migrations/202607170005_harden_automated_moderation_function_acl.sql",
  "utf8",
);
const moderationMigration = readFileSync(
  "supabase/migrations/202607170003_automated_question_moderation.sql",
  "utf8",
);

describe("durcissement des fonctions de modération automatique", () => {
  it("réserve la soumission modérée au service_role", () => {
    expect(migration).toMatch(
      /revoke all on function public\.submit_moderated_question\([\s\S]*?\) from public, anon, authenticated;/,
    );
    expect(migration).toMatch(
      /grant execute on function public\.submit_moderated_question\([\s\S]*?\) to service_role;/,
    );
  });

  it("réserve le statut privé à authenticated", () => {
    expect(migration).toContain(
      "revoke all on function public.get_current_question_review_status()",
    );
    expect(migration).toContain(
      "grant execute on function public.get_current_question_review_status()\n  to authenticated;",
    );
    expect(moderationMigration).toMatch(
      /get_current_question_review_status[\s\S]*q\.author_id=auth\.uid\(\)/,
    );
  });

  it("interdit la file à anon et conserve le contrôle administrateur", () => {
    expect(migration).toMatch(
      /get_pending_automated_moderation_queue\(integer, integer\)[\s\S]*from public, anon, authenticated, service_role;[\s\S]*get_pending_automated_moderation_queue\(integer, integer\)[\s\S]*to authenticated;/,
    );
    expect(moderationMigration).toMatch(
      /get_pending_automated_moderation_queue[\s\S]*if not public\.is_admin\(\)then raise exception 'not_authorized'/,
    );
  });

  it("ne modifie ni données, ni tables, ni anciennes RPC", () => {
    expect(migration).not.toMatch(/\b(insert|update|delete|truncate|alter table|drop table)\b/i);
    expect(migration).not.toMatch(/save_question_draft|publish_question/);
    expect(migration.trimStart().startsWith("begin;")).toBe(true);
    expect(migration.trimEnd().endsWith("commit;")).toBe(true);
  });
});
