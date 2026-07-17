import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "supabase/migrations/202607170009_open_question_reporting.sql",
  "utf8",
);

function functionDefinition(name: string) {
  const definition = migration.match(
    new RegExp(
      `create\\s+(?:or\\s+replace\\s+)?function\\s+public\\.${name}\\b[\\s\\S]*?\\$\\$;`,
      "i",
    ),
  )?.[0];

  expect(definition, `La migration doit redéfinir public.${name}.`).toBeDefined();
  return definition ?? "";
}

function functionBody(name: string) {
  const body = functionDefinition(name).match(/\bas\s+\$\$([\s\S]*?)\$\$;/i)?.[1];

  expect(body, `Le corps de public.${name} doit être lisible par le contrat.`).toBeDefined();
  return body ?? "";
}

function compactSql(sql: string) {
  return sql
    .replace(/\s+/g, " ")
    .replace(/\s*,\s*/g, ",")
    .replace(/\s*\(\s*/g, "(")
    .replace(/\s*\)\s*/g, ")")
    .trim()
    .toLowerCase();
}

const rpcSignatures = [
  "public.save_question_draft(uuid,text,uuid,text[],text[],smallint,smallint,uuid)",
  "public.publish_question(uuid,boolean)",
  "public.get_moderation_queue(public.report_status,integer)",
  "public.moderate_report(uuid,public.moderation_action_type,text)",
];

describe("questions ouvertes et signalements groupés", () => {
  it("publie immédiatement sans filtre de contenu, quota ou similarité", () => {
    const draft = functionBody("save_question_draft");
    const publish = functionBody("publish_question");

    for (const sql of [draft, publish]) {
      expect(sql).not.toMatch(/question_forbidden_terms|forbidden_content/i);
      expect(sql).not.toMatch(
        /active_limit|hourly_publish_limit|ordinary_rolling_limit|rolling_limit|rate_limit/i,
      );
      expect(sql).not.toMatch(
        /find_similar_questions|question_duplicate_reviews|exact_duplicate|high_similarity|similarity_confirmation_required/i,
      );
    }

    expect(publish).toMatch(/update\s+public\.questions[\s\S]*?status\s*=\s*'published'/i);
    expect(publish).toMatch(/published_at\s*=\s*now\s*\(\s*\)/i);
    expect(publish).not.toMatch(/under_review|pending_admin_review/i);
  });

  it("rattache uniquement des tags contrôlés déjà existants", () => {
    const draft = functionBody("save_question_draft");

    expect(draft).not.toMatch(/insert\s+into\s+public\.tags\b/i);
    expect(draft).toMatch(
      /insert\s+into\s+public\.question_tags\b[\s\S]*?select[\s\S]*?from\s+public\.tags\b/i,
    );
  });

  it("n'affiche une question qu'après trois signalants actifs distincts et la groupe", () => {
    const queue = functionBody("get_moderation_queue");

    expect(queue).toMatch(/not\s+public\.is_moderator\s*\(\s*\)/i);
    expect(queue).toMatch(/(?:\w+\.)?target_type\s*=\s*'question'/i);
    expect(queue).toMatch(
      /(?:\w+\.)?status\s+in\s*\(\s*'pending'\s*,\s*'reviewing'\s*\)/i,
    );
    expect(queue).toMatch(/group\s+by\s+(?:\w+\.)?question_id\b/i);
    expect(queue).toMatch(
      /having\s+count\s*\(\s*distinct\s+(?:\w+\.)?reporter_id\s*\)\s*>=\s*3/i,
    );
  });

  it("résout ou rejette tous les signalements actifs de la question modérée", () => {
    const moderate = functionBody("moderate_report");

    expect(moderate).toMatch(/not\s+public\.is_moderator\s*\(\s*\)/i);
    expect(moderate).toMatch(
      /update\s+public\.reports\b[\s\S]*?set\s+status\s*=\s*case[\s\S]*?'no_action'[\s\S]*?'dismissed'[\s\S]*?'resolved'/i,
    );
    expect(moderate).toMatch(
      /update\s+public\.reports\b[\s\S]*?where[\s\S]*?question_id\s*=\s*item\.question_id[\s\S]*?status\s+in\s*\(\s*'pending'\s*,\s*'reviewing'\s*\)/i,
    );
  });

  it("conserve l'authentification des RPC et interdit les écritures directes", () => {
    const draft = functionBody("save_question_draft");
    const publish = functionBody("publish_question");
    const revokeClauses = (migration.match(/revoke\s+all\s+on\s+function\s+[^;]+from\s+public\s*;/gi) ?? []).map(
      compactSql,
    );
    const grantClauses = (migration.match(
      /grant\s+execute\s+on\s+function\s+[^;]+to\s+authenticated\s*;/gi,
    ) ?? []).map(compactSql);

    expect(draft).toMatch(/auth\.uid\s*\(\s*\)/i);
    expect(draft).toMatch(/public\.is_active_user\s*\(/i);
    expect(publish).toMatch(/auth\.uid\s*\(\s*\)/i);
    expect(publish).toMatch(/public\.is_active_user\s*\(/i);

    for (const signature of rpcSignatures) {
      expect(revokeClauses.some((clause) => clause.includes(signature))).toBe(true);
      expect(grantClauses.some((clause) => clause.includes(signature))).toBe(true);
    }

    expect(migration).not.toMatch(
      /grant\s+[^;]*\b(?:insert|update|delete|all)\b[^;]*\bon\s+(?:table\s+)?public\.(?:questions|question_options|tags|question_tags|reports|moderation_cases|moderation_actions)\b[^;]*\bto\s+(?:anon|authenticated)\b/i,
    );
  });
});
