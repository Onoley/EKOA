import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { configuredClient } from "../src/features/question-import/database";

const EXPECTED_PROJECT = "nangxvaaawraqkqpxuqk";
const USERNAME = "ekoa_demo";
const mask = (id: string) => `${id.slice(0, 4)}…${id.slice(-4)}`;

async function main() {
  const url = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "");
  if (url.hostname.split(".")[0] !== EXPECTED_PROJECT) throw new Error("Projet Supabase non autorisé.");
  const db = configuredClient();
  const [profiles, admins, firstBefore] = await Promise.all([
    db.from("profiles").select("user_id,username,role,account_status").eq("username_normalized", USERNAME),
    db.from("profiles").select("user_id,username").eq("role", "admin").eq("account_status", "active"),
    db.from("profiles").select("user_id,role,account_status").eq("username_normalized", "first").maybeSingle(),
  ]);
  for (const result of [profiles, admins, firstBefore]) if (result.error) throw new Error(result.error.message);
  if (profiles.data?.length !== 1) throw new Error("Le profil ekoa_demo doit être unique.");
  const profile = profiles.data[0];
  if (profile.account_status !== "active") throw new Error("Le profil ekoa_demo n’est pas actif.");
  const authUser = await db.auth.admin.getUserById(profile.user_id);
  if (authUser.error || !authUser.data.user) throw new Error("Identité Auth ekoa_demo introuvable.");
  const otherAdmins = (admins.data ?? []).filter((admin) => admin.user_id !== profile.user_id);
  if (otherAdmins.length) throw new Error("Un autre administrateur actif existe : bootstrap refusé.");
  const roleBefore = profile.role;
  if (profile.role !== "admin") {
    const updated = await db.from("profiles").update({ role: "admin" }).eq("user_id", profile.user_id).eq("role", "user").select("user_id,role,account_status").single();
    if (updated.error || updated.data.role !== "admin") throw new Error(updated.error?.message ?? "Promotion administrateur non confirmée.");
    const audit = await db.from("audit_log").insert({ actor_id: profile.user_id, action: "bootstrap_first_admin", target_type: "profile", target_id: profile.user_id, metadata: { username: USERNAME, project_ref: EXPECTED_PROJECT, previous_role: roleBefore, new_role: "admin" } });
    if (audit.error) throw new Error(`Promotion appliquée mais audit impossible : ${audit.error.message}`);
  }
  const [verified, firstAfter] = await Promise.all([
    db.from("profiles").select("role,account_status").eq("user_id", profile.user_id).single(),
    db.from("profiles").select("role,account_status").eq("username_normalized", "first").maybeSingle(),
  ]);
  if (verified.error || verified.data.role !== "admin" || verified.data.account_status !== "active") throw new Error("État administrateur final invalide.");
  if (firstAfter.error || JSON.stringify(firstAfter.data) !== JSON.stringify(firstBefore.data ? { role: firstBefore.data.role, account_status: firstBefore.data.account_status } : null)) throw new Error("Le profil FIRST a changé : arrêt.");
  const envPath = resolve(".env.local");
  const env = await readFile(envPath, "utf8");
  const retained = env.split(/\r?\n/).filter((line) => !/^EKOA_EDITORIAL_(?:ACCOUNT|ORGANISATION)_ID=/.test(line));
  while (retained.at(-1) === "") retained.pop();
  retained.push(`EKOA_EDITORIAL_ACCOUNT_ID=${profile.user_id}`, "");
  await writeFile(envPath, retained.join("\n"), { mode: 0o600 });
  console.log(JSON.stringify({ project: EXPECTED_PROJECT, username: USERNAME, userId: mask(profile.user_id), roleBefore, roleAfter: "admin", authIdentityVerified: true, certificationCreated: false, firstUnchanged: true, configuredVariable: "EKOA_EDITORIAL_ACCOUNT_ID" }, null, 2));
}
main().catch((error: unknown) => { console.error(error instanceof Error ? error.message : "Erreur inconnue."); process.exitCode = 1; });
