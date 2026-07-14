import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync("supabase/migrations/202607130002_phase_2_questions.sql", "utf8");
describe("contrat questions et RLS de la phase 2", () => {
  it.each(["question_forbidden_terms", "question_series", "questions", "question_options", "tags", "question_tags", "question_duplicate_reviews"])("active RLS sur %s", (table) => expect(migration).toContain(`alter table public.${table} enable row level security`));
  it("ne donne aucune écriture directe sur les questions", () => expect(migration).not.toMatch(/grant\s+(insert|update|delete|all)[^;]*public\.questions/i));
  it("réserve les écritures aux fonctions transactionnelles", () => { expect(migration).toContain("create function public.save_question_draft"); expect(migration).toContain("create function public.publish_question"); expect(migration.match(/security definer/g)?.length).toBeGreaterThanOrEqual(3); });
  it("verrouille les quotas et les doublons concurrents", () => expect(migration.match(/pg_advisory_xact_lock/g)).toHaveLength(2));
  it("filtre la lecture des brouillons par auteur", () => expect(migration).toMatch(/questions_select_visible[\s\S]*author_id=auth\.uid\(\)/));
  it("bloque les doublons exacts et très proches", () => {
    expect(migration).toContain("raise exception 'exact_duplicate'");
    expect(migration).toContain("raise exception 'high_similarity'");
  });
  it("exige et conserve la confirmation de similarité moyenne", () => {
    expect(migration).toContain("raise exception 'similarity_confirmation_required'");
    expect(migration).toContain("insert into public.question_duplicate_reviews");
  });
});
