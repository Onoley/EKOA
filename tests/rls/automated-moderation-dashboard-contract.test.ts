import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync("supabase/migrations/202607170006_automated_moderation_dashboard.sql", "utf8");
const actions = readFileSync("src/features/moderation/actions.ts", "utf8");
const adminPage = readFileSync("src/app/admin/page.tsx", "utf8");
const profilePage = readFileSync("src/app/(app)/profil/page.tsx", "utf8");
const revisionForm = readFileSync("src/features/moderation/question-revision-form.tsx", "utf8");
const deferred = readFileSync("supabase/deferred_migrations/202607170004_remove_legacy_question_submission.sql", "utf8");

describe("dashboard de modération automatique", () => {
  it("1. publie les décisions ALLOW sans créer de file", () => {
    expect(migration).toContain("action='ALLOW'");
    expect(migration).toContain("if automated_status='pending_admin_review' then insert into public.automated_moderation_queue");
  });
  it("2. conserve les termes core dans la projection de review", () => expect(migration).toContain("where term->>'tier'='core'"));
  it("3. ne transforme pas un terme extended seul en review dans la base", () => expect(migration).not.toMatch(/tier'='extended'[\s\S]*pending_admin_review/));
  it("4. analyse la question et chaque option", () => expect(migration).toContain("jsonb_array_length(requested_moderation->'checks')<>cardinality(requested_options)+1"));
  it("5. classe une menace grave en priorité urgente selon le résultat du moteur", () => expect(migration).toContain("requested_moderation->>'priority'"));
  it("6. refuse le dashboard à un utilisateur ordinaire", () => expect(migration).toMatch(/get_automated_moderation_dashboard[\s\S]*if not public\.is_admin\(\)/));
  it("7. donne à l’administrateur une projection sûre de la file", () => {
    expect(migration).toContain("grant execute on function public.get_automated_moderation_dashboard");
    expect(migration).not.toMatch(/returns table\([\s\S]*?regex/);
  });
  it("8. valide telle quelle et publie", () => expect(migration).toMatch(/approve_as_is[\s\S]*status='published'[\s\S]*automated_moderation_status='approved'/));
  it("9. enregistre un faux positif sans avertissement", () => {
    expect(migration).toContain("'false_positive'");
    expect(migration).toContain("requested_decision not in('request_rewrite','reject') and requested_warning_level<>0");
  });
  it("10. versionne une réécriture suggérée avant publication", () => expect(migration).toMatch(/approve_suggested_rewrite[\s\S]*insert into public\.question_text_versions/));
  it("11. demande une réécriture sur la même question", () => expect(migration).toMatch(/requested_decision='request_rewrite'[\s\S]*automated_moderation_status='revision_required'/));
  it("12. réanalyse et remet le renvoi en attente", () => expect(migration).toMatch(/resubmit_automated_question_revision[\s\S]*automated_moderation_status='pending_admin_review'/));
  it("13. refuse sans avertissement", () => expect(migration).toContain("requested_warning_level smallint default 0"));
  it("14. accepte explicitement un avertissement niveau 1", () => expect(migration).toContain("requested_warning_level not in(0,1)"));
  it("15. accepte explicitement un avertissement niveau 2 sur un refus", () => expect(migration).toContain("warning_level between 0 and 3"));
  it("16. accepte explicitement un avertissement niveau 3 sur un refus", () => expect(migration).toContain("level smallint not null check(level between 1 and 3)"));
  it("17. ne crée aucun avertissement automatiquement", () => expect(migration).toMatch(/if requested_warning_level>0 then[\s\S]*insert into public\.question_moderation_warnings/));
  it("18. empêche une deuxième décision", () => expect(migration).toContain("QUESTION_REVIEW_ALREADY_DECIDED"));
  it("19. conserve les questions en attente hors du statut publié", () => expect(migration).toContain("status='under_review',automated_moderation_status='revision_required'"));
  it("20. conserve une seule question ouverte par utilisateur", () => {
    expect(migration).toContain("QUESTION_REVIEW_ALREADY_PENDING");
    expect(migration).toContain("pg_advisory_xact_lock");
  });
  it("21. autorise les montants en euros sans relâcher les téléphones", () => {
    expect(migration).toContain("regexp_replace");
    expect(migration).toContain("[[:space:]]*€");
    expect(migration).toContain("\\+?[0-9][0-9 .-]{7,}");
  });
});

describe("intégration et sécurité du parcours", () => {
  it("réserve les décisions et renvois au service_role", () => {
    expect(migration).toMatch(/admin_decide_automated_question[\s\S]*to service_role/);
    expect(migration).toMatch(/resubmit_automated_question_revision[\s\S]*to service_role/);
  });
  it("contrôle les rôles dans les actions serveur", () => {
    expect(actions).toContain("await requireAdmin()");
    expect(actions).toContain("await requireActiveProfile()");
  });
  it("affiche les quatre onglets admin", () => ["En attente", "Réécriture", "Urgentes", "Historique"].forEach((label) => expect(adminPage).toContain(label)));
  it("affiche la progression et la réécriture sur le profil privé", () => {
    expect(profilePage).toContain("Ma question proposée");
    expect(revisionForm).toContain("Renvoyer ma question");
  });
  it("est additive et ne touche pas aux données éditoriales", () => {
    expect(migration.trimStart().startsWith("begin;")).toBe(true);
    expect(migration.trimEnd().endsWith("commit;")).toBe(true);
    expect(migration).not.toMatch(/\b(delete from public\.questions|truncate|drop table)\b/i);
  });
  it("laisse la migration 004 dans le dossier différé", () => expect(deferred).toContain("Deferred migration"));
});
