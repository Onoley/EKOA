import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "supabase/migrations/202607170008_remove_automated_question_moderation.sql",
  "utf8",
);

describe("retrait de la modération automatique", () => {
  it("rend les questions en attente à leur auteur sous forme de brouillons", () => {
    expect(migration).toMatch(/set status = 'draft', published_at = null/);
    expect(migration).toContain("'pending_admin_review', 'revision_required'");
  });

  it("retire les fonctions et les données de revue automatique", () => {
    expect(migration).toContain("drop function if exists public.submit_moderated_question");
    expect(migration).toContain("drop table if exists public.automated_moderation_queue");
    expect(migration).toContain("drop table if exists public.question_moderation_checks");
    expect(migration).toContain("drop type if exists public.automated_question_moderation_status");
  });

  it("restaure la publication authentifiée et conserve le filtre manuel", () => {
    expect(migration).toContain("grant execute on function public.publish_question");
    expect(migration).toMatch(/moderation_status in \('clear', 'approved'\)/);
  });
});
