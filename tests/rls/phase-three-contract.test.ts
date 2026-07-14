import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync("supabase/migrations/202607130003_phase_3_voting.sql", "utf8");
describe("contrat vote et résultats de la phase 3", () => {
  it.each(["votes", "question_follows", "question_upvotes"])("active RLS sur %s", (table) => expect(migration).toContain(`alter table public.${table} enable row level security`));
  it("rend le vote unique par question et utilisateur", () => expect(migration).toContain("unique(question_id, user_id)"));
  it("ne donne aucun droit direct de mutation", () => expect(migration).not.toMatch(/grant\s+(insert|update|delete|all)[^;]*public\.(votes|question_follows|question_upvotes)/i));
  it("retire les compteurs des lectures directes", () => { expect(migration).toContain("revoke select on public.questions, public.question_options"); expect(migration).not.toMatch(/grant select\([^)]*vote_count/); });
  it("exige un vote avant les résultats", () => expect(migration).toContain("raise exception 'vote_required'"));
  it("interdit le changement de réponse", () => expect(migration).toContain("raise exception 'vote_immutable'"));
  it("verrouille les mutations idempotentes", () => expect(migration.match(/pg_advisory_xact_lock/g)).toHaveLength(3));
  it("réserve le soutien aux répondants", () => expect(migration).toMatch(/set_question_upvote[\s\S]*exists\(select 1 from public\.votes/));
});
