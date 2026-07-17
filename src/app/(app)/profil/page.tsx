import Link from "next/link";
import { signOut } from "@/features/auth/actions";
import { requireActiveProfile } from "@/features/auth/authorization";
import { QuestionRevisionForm } from "@/features/moderation/question-revision-form";
import type { MyModeratedQuestion } from "@/features/moderation/schema";
import { AdminNameBadge, ProfileAvatar } from "@/features/profile/avatar";
import { getPublicEnv } from "@/lib/config/env";

const statusLabels: Record<string, string> = { draft: "Brouillon", published: "Publiée", limited: "Diffusion limitée", under_review: "En cours d’examen", removed: "Retirée", archived: "Archivée" };
const warningLabels: Record<number, string> = { 1: "Rappel des règles", 2: "Avertissement sérieux", 3: "Avertissement grave" };

function ProposedQuestion({ question }: { question: MyModeratedQuestion }) {
  const resolved = ["not_required", "approved", "rejected"].includes(question.automated_moderation_status);
  const revisionRequired = question.automated_moderation_status === "revision_required";
  const steps = [
    { label: "Question envoyée", complete: true },
    { label: "Analyse automatique terminée", complete: true },
    { label: "Validation par l’équipe Ekoa", complete: resolved, current: !resolved },
    { label: "Décision rendue", complete: resolved },
  ];
  return <section className="mt-7 rounded-3xl border border-black/10 p-5" aria-labelledby="proposed-question">
    <h2 id="proposed-question" className="text-xl font-bold">Ma question proposée</h2>
    <ol className="review-progress mt-5">{steps.map((step, index) => <li className={step.complete ? "complete" : step.current ? "current" : ""} key={step.label}><span aria-hidden="true">{step.complete ? "✓" : index + 1}</span><p>{step.label}</p></li>)}</ol>
    <p className="mt-5 rounded-2xl bg-[var(--background)] p-4 font-semibold">{question.question_text}</p>
    {question.automated_moderation_status === "pending_admin_review" ? <p className="mt-4 text-sm">Votre question est en cours de validation par l’équipe Ekoa.</p> : null}
    {revisionRequired ? <div className="mt-4"><p className="font-bold">Une réécriture est demandée.</p>{question.admin_reason ? <p className="mt-2 text-sm">{question.admin_reason}</p> : null}{question.suggested_rewrite ? <div className="mt-3 rounded-2xl border border-blue-200 bg-blue-50 p-4 text-sm"><strong>Suggestion Ekoa :</strong><p className="mt-1">{question.suggested_rewrite}</p></div> : null}{question.warning_level ? <p className="mt-3 text-sm font-bold text-[var(--danger)]">{warningLabels[question.warning_level]} — niveau {question.warning_level}</p> : null}<QuestionRevisionForm questionId={question.question_id} text={question.question_text} options={question.options.map((option) => option.text)} /></div> : null}
    {["not_required", "approved"].includes(question.automated_moderation_status) ? <p className="mt-4 font-semibold text-green-800">Votre question a été validée et publiée.</p> : null}
    {question.automated_moderation_status === "rejected" ? <div className="mt-4"><p className="font-semibold text-[var(--danger)]">Votre question n’a pas été publiée.</p>{question.admin_reason ? <p className="mt-2 text-sm">{question.admin_reason}</p> : null}{question.warning_level ? <p className="mt-2 text-sm font-bold">{warningLabels[question.warning_level]} — niveau {question.warning_level}</p> : <p className="mt-2 text-sm text-[var(--muted)]">Aucun avertissement n’a été ajouté.</p>}</div> : null}
  </section>;
}

export default async function ProfilePage() {
  const { profile, supabase } = await requireActiveProfile();
  const env = getPublicEnv();
  const [questionsResult, followResult, categoryResult, verifiedResult, moderationResult] = await Promise.all([
    supabase.from("questions").select("id,text,status").eq("author_id", profile.user_id).order("created_at", { ascending: false }),
    supabase.from("question_follows").select("question_id").eq("user_id", profile.user_id).order("created_at", { ascending: false }),
    supabase.from("category_follows").select("category_id,categories(id,slug,name)").eq("user_id", profile.user_id),
    supabase.rpc("get_followed_verified_profiles"),
    supabase.rpc("get_my_moderated_question"),
  ]);
  const followedIds = followResult.data?.map((row) => row.question_id) ?? [];
  const followedResult = followedIds.length ? await supabase.from("questions").select("id,text").in("id", followedIds).eq("status", "published").in("moderation_status", ["clear", "approved"]) : { data: [], error: null };
  const moderatedQuestion = (Array.isArray(moderationResult.data) ? moderationResult.data[0] ?? null : moderationResult.data ?? null) as MyModeratedQuestion | null;
  const hasError = questionsResult.error || followResult.error || followedResult.error || verifiedResult.error || moderationResult.error;

  return <main className="mobile-page profile-page p-5">
    <div className="flex items-start justify-between gap-3"><div><h1 className="title">Profil</h1><p className="body-copy mt-1">Vos contenus et informations privées.</p></div><Link href="/profil/parametres" className="secondary-button compact" aria-label="Ouvrir les paramètres">⚙</Link></div>
    <section className="profile-hero mt-6 rounded-3xl border border-black/10 p-5"><ProfileAvatar userId={profile.user_id} username={profile.username ?? "membre supprimé"} supabaseUrl={env.NEXT_PUBLIC_SUPABASE_URL} className="profile-page-avatar" verified={profile.account_type === "verified"} admin={profile.role === "admin"} /><div className="profile-name-row mt-4"><h2 className="text-xl font-bold">@{profile.username}</h2>{profile.role === "admin" ? <AdminNameBadge /> : null}</div><p className="text-sm text-[var(--muted)]">{profile.role === "admin" ? "Compte administrateur certifié" : `Compte ${profile.account_type === "verified" ? "vérifié" : "ordinaire"}`}</p>{profile.role === "admin" ? <Link href="/admin" className="admin-access-button mt-4">Ouvrir le tableau de bord admin <span aria-hidden="true">→</span></Link> : null}{profile.account_type === "verified" ? <Link href="/profil/campagnes" className="secondary-button mt-4">Rapports sponsor</Link> : null}</section>
    {hasError ? <div role="alert" className="error-state mt-5">Certaines informations du profil n’ont pas pu être chargées.</div> : null}
    {moderatedQuestion ? <ProposedQuestion question={moderatedQuestion} /> : null}

    <section className="mt-7" aria-labelledby="created"><div className="flex justify-between gap-3"><h2 id="created" className="text-xl font-bold">Questions créées</h2><Link href="/creer" className="secondary-button compact">Créer</Link></div>{questionsResult.data?.length ? <ul className="mt-4 space-y-3">{questionsResult.data.map((question) => <li key={question.id} className="rounded-2xl border border-black/10 p-4"><p className="font-semibold">{question.text}</p><p className="mt-1 text-sm text-[var(--muted)]">{statusLabels[question.status] ?? question.status}</p><div className="mt-3 flex gap-2">{question.status === "draft" ? <Link href={`/creer?draft=${question.id}`} className="secondary-button compact">Modifier</Link> : null}{question.status === "published" ? <><Link href={`/questions/${question.id}`} className="primary-button compact">Voir</Link><Link href={`/creer?wave=${question.id}`} className="secondary-button compact">Nouvelle vague</Link></> : null}</div></li>)}</ul> : <div className="empty-state mt-4">Aucune question créée.</div>}</section>
    <section className="mt-7" aria-labelledby="followed"><h2 id="followed" className="text-xl font-bold">Questions suivies</h2>{followedResult.data?.length ? <ul className="mt-4 space-y-3">{followedResult.data.map((question) => <li key={question.id}><Link href={`/questions/${question.id}`} className="block rounded-2xl border border-black/10 p-4 font-semibold">{question.text}</Link></li>)}</ul> : <div className="empty-state mt-4">Aucune question suivie.</div>}</section>
    <section className="mt-7" aria-labelledby="categories"><h2 id="categories" className="text-xl font-bold">Catégories suivies</h2>{categoryResult.data?.length ? <ul className="mt-4 flex flex-wrap gap-2">{categoryResult.data.map((row) => { const category = Array.isArray(row.categories) ? row.categories[0] : row.categories; return category ? <li key={category.id}><Link href={`/fil?category=${category.slug}`} className="secondary-button compact">{category.name}</Link></li> : null; })}</ul> : <div className="empty-state mt-4">Aucune catégorie suivie.</div>}</section>
    <section className="mt-7" aria-labelledby="accounts"><h2 id="accounts" className="text-xl font-bold">Comptes vérifiés suivis</h2>{Array.isArray(verifiedResult.data) && verifiedResult.data.length ? <ul className="mt-4 space-y-3">{verifiedResult.data.map((account: { user_id: string; username: string }) => <li key={account.user_id}><Link href={`/profils/${account.username}`} className="block rounded-2xl border border-black/10 p-4 font-semibold">@{account.username} · Compte vérifié</Link></li>)}</ul> : <div className="empty-state mt-4">Aucun compte vérifié suivi.</div>}</section>
    <form action={signOut} className="mt-8"><button className="secondary-button w-full">Se déconnecter</button></form>
  </main>;
}
