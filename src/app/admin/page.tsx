import { requireAdmin } from "@/features/auth/authorization";
import {
  AutomatedModerationDecisionForm,
  ForbiddenTermForm,
  ForbiddenTermToggle,
  QuickVerificationForm,
  SuspensionForm,
  VerificationForm,
} from "@/features/moderation/admin-forms";
import { ModerationForm } from "@/features/moderation/moderation-form";
import {
  accountSearchSchema,
  type AutomatedModerationHistoryItem,
  type AutomatedModerationQueueItem,
} from "@/features/moderation/schema";
import { SponsorCampaignForm, SponsorCampaignStatusForm, SponsorOrganisationForm } from "@/features/sponsorship/admin-forms";

type QueueItem = { report_id: string; target_type: "question" | "comment"; target_id: string; reason: string; details: string | null; status: string; created_at: string; target_excerpt: string | null };
type ModerationTab = "pending" | "rewrite" | "urgent" | "history";

const decisionLabels: Record<AutomatedModerationHistoryItem["decision"], string> = {
  approve_as_is: "Validée telle quelle",
  false_positive: "Faux positif",
  approve_suggested_rewrite: "Réécriture suggérée validée",
  approve_manual_edit: "Modifiée et publiée",
  request_rewrite: "Réécriture demandée",
  reject: "Refusée",
};
const priorityLabels = { urgent: "Urgente", high: "Haute", normal: "Normale" } as const;

function sourceLabel(source: string) {
  if (source === "question") return "Question";
  const match = /^option_(\d+)$/.exec(source);
  return match ? `Option ${match[1]}` : source;
}

function ReportItems({ items, empty }: { items: QueueItem[]; empty: string }) {
  if (!items.length) return <div className="empty-state mt-4">{empty}</div>;
  return <ul className="mt-4 space-y-4">{items.map((item) => <li key={item.report_id} className="rounded-3xl border border-black/10 p-5">
    <div className="flex justify-between gap-3"><span className="eyebrow">{item.target_type === "question" ? "Question" : "Commentaire"}</span><time className="text-xs text-[var(--muted)]" dateTime={item.created_at}>{new Date(item.created_at).toLocaleDateString("fr-FR")}</time></div>
    <p className="mt-4 font-bold">{item.target_excerpt ?? "Contenu indisponible"}</p><p className="mt-2 text-sm"><strong>Motif :</strong> {item.reason}</p>{item.details ? <p className="mt-2 rounded-xl bg-[var(--background)] p-3 text-sm">{item.details}</p> : null}<ModerationForm reportId={item.report_id} targetType={item.target_type} />
  </li>)}</ul>;
}

function SignalList({ label, values }: { label: string; values: Array<{ value: string; source: string }> }) {
  return <div><dt className="text-xs font-bold uppercase tracking-wide text-[var(--muted)]">{label}</dt><dd className="mt-1 text-sm">{values.length ? values.map((entry) => `${entry.value} · ${sourceLabel(entry.source)}`).join(", ") : "Aucun"}</dd></div>;
}

function AutomatedQueueCards({ items }: { items: AutomatedModerationQueueItem[] }) {
  if (!items.length) return <div className="empty-state mt-5">Aucune question dans cette section.</div>;
  return <ul className="mt-5 space-y-5">{items.map((item) => <li key={item.queue_id} className="moderation-review-card">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="flex flex-wrap gap-2"><span className={`moderation-priority ${item.priority}`}>{priorityLabels[item.priority]}</span><span className="eyebrow">Sévérité {item.estimated_severity}/3</span></div>
      <time className="text-xs text-[var(--muted)]" dateTime={item.submitted_at}>{new Date(item.submitted_at).toLocaleString("fr-FR")}</time>
    </div>
    <p className="mt-4 text-sm text-[var(--muted)]">Proposée par <strong>@{item.username}</strong></p>
    <h3 className="mt-2 text-xl font-extrabold leading-tight">{item.question_text}</h3>
    <ol className="mt-4 space-y-2">{item.options.map((option) => <li key={option.position} className="rounded-xl border border-black/10 bg-white px-4 py-3 text-sm font-semibold">{option.position}. {option.text}</li>)}</ol>
    <dl className="mt-5 grid gap-4 rounded-2xl bg-[var(--background)] p-4 sm:grid-cols-2">
      <div><dt className="text-xs font-bold uppercase tracking-wide text-[var(--muted)]">Cible</dt><dd className="mt-1 text-sm">{item.target_type}</dd></div>
      <div><dt className="text-xs font-bold uppercase tracking-wide text-[var(--muted)]">Intention</dt><dd className="mt-1 text-sm">{item.intent}</dd></div>
      <SignalList label="Termes core" values={item.core_terms.map((entry) => ({ value: entry.term, source: entry.source }))} />
      <SignalList label="Expressions" values={item.expressions.map((entry) => ({ value: entry.expression, source: entry.source }))} />
      <SignalList label="Motifs" values={item.patterns.map((entry) => ({ value: entry.pattern, source: entry.source }))} />
      <div><dt className="text-xs font-bold uppercase tracking-wide text-[var(--muted)]">Sources du signal</dt><dd className="mt-1 text-sm">{item.signal_sources.length ? item.signal_sources.map(sourceLabel).join(", ") : "Analyse globale"}</dd></div>
      <div className="sm:col-span-2"><dt className="text-xs font-bold uppercase tracking-wide text-[var(--muted)]">Raisons</dt><dd className="mt-1 text-sm">{item.reason_codes.length ? item.reason_codes.join(", ") : item.action_recommended}</dd></div>
    </dl>
    {item.suggested_rewrite ? <div className="mt-4 rounded-2xl border border-blue-200 bg-blue-50 p-4"><p className="text-xs font-bold uppercase tracking-wide text-blue-800">Réécriture suggérée</p><p className="mt-2 text-sm">{item.suggested_rewrite}</p></div> : null}
    <details className="mt-4"><summary className="cursor-pointer font-semibold">Voir la version originale</summary><p className="mt-3 rounded-xl bg-[var(--background)] p-3 text-sm">{item.original_text}</p></details>
    <AutomatedModerationDecisionForm questionId={item.question_id} text={item.question_text} options={item.options.map((option) => option.text)} hasSuggestedRewrite={Boolean(item.suggested_rewrite)} />
  </li>)}</ul>;
}

function AutomatedHistory({ items }: { items: AutomatedModerationHistoryItem[] }) {
  if (!items.length) return <div className="empty-state mt-5">Aucune décision de modération automatique.</div>;
  return <ul className="mt-5 space-y-4">{items.map((item) => <li key={item.decision_id} className="rounded-3xl border border-black/10 p-5">
    <div className="flex items-center justify-between gap-3"><span className="eyebrow">{decisionLabels[item.decision]}</span><time className="text-xs text-[var(--muted)]" dateTime={item.created_at}>{new Date(item.created_at).toLocaleString("fr-FR")}</time></div>
    <p className="mt-3 font-bold">{item.final_text}</p><p className="mt-2 text-sm text-[var(--muted)]">Auteur : @{item.author_username} · Décision : @{item.admin_username}</p><p className="mt-2 text-sm">{item.admin_reason}</p>{item.warning_level ? <p className="mt-2 text-sm font-bold text-[var(--danger)]">Avertissement niveau {item.warning_level}</p> : null}
    {item.previous_text !== item.final_text ? <details className="mt-3"><summary className="cursor-pointer text-sm font-semibold">Comparer les versions</summary><p className="mt-2 rounded-xl bg-[var(--background)] p-3 text-sm"><strong>Avant :</strong> {item.previous_text}</p></details> : null}
  </li>)}</ul>;
}

export default async function AdminPage({ searchParams }: { searchParams: Promise<{ compte?: string; moderation?: string }> }) {
  const { supabase } = await requireAdmin();
  const params = await searchParams;
  const tab: ModerationTab = ["pending", "rewrite", "urgent", "history"].includes(params.moderation ?? "") ? params.moderation as ModerationTab : "pending";
  const accountName = accountSearchSchema.safeParse(params.compte);
  const [pendingResult, rewriteResult, urgentResult, automatedHistoryResult, queueResult, resolvedResult, historyResult] = await Promise.all([
    supabase.rpc("get_automated_moderation_dashboard", { requested_tab: "pending", requested_limit: 100, requested_offset: 0 }),
    supabase.rpc("get_automated_moderation_dashboard", { requested_tab: "rewrite", requested_limit: 100, requested_offset: 0 }),
    supabase.rpc("get_automated_moderation_dashboard", { requested_tab: "urgent", requested_limit: 100, requested_offset: 0 }),
    supabase.rpc("get_automated_moderation_history", { requested_limit: 100, requested_offset: 0 }),
    supabase.rpc("get_moderation_queue", { requested_status: "pending", requested_limit: 50 }),
    supabase.rpc("get_moderation_queue", { requested_status: "resolved", requested_limit: 10 }),
    supabase.from("moderation_actions").select("id,action,target_type,target_id,reason,created_at").order("created_at", { ascending: false }).limit(20),
  ]);
  const automatedQueues = {
    pending: (pendingResult.data ?? []) as AutomatedModerationQueueItem[],
    rewrite: (rewriteResult.data ?? []) as AutomatedModerationQueueItem[],
    urgent: (urgentResult.data ?? []) as AutomatedModerationQueueItem[],
  };
  const automatedHistory = (automatedHistoryResult.data ?? []) as AutomatedModerationHistoryItem[];
  const automatedError = Boolean(pendingResult.error || rewriteResult.error || urgentResult.error || automatedHistoryResult.error);

  const [termResult, accountResult, auditResult, sponsorResult] = await Promise.all([
    supabase.rpc("get_admin_forbidden_terms"),
    accountName.success ? supabase.rpc("admin_find_account", { requested_username: accountName.data }) : Promise.resolve({ data: null, error: null }),
    supabase.from("audit_log").select("id,action,target_type,created_at").order("created_at", { ascending: false }).limit(20),
    supabase.rpc("get_admin_sponsor_overview"),
  ]);
  const terms = Array.isArray(termResult.data) ? termResult.data as Array<{ id: string; term: string; severity: number; is_active: boolean }> : null;
  const account = Array.isArray(accountResult.data) ? accountResult.data[0] as { user_id: string; username: string; role: string; account_type: string; account_status: string } | undefined : undefined;
  const audit = Array.isArray(auditResult.data) ? auditResult.data as Array<{ id: string; action: string; target_type: string; created_at: string }> : null;
  const sponsors = Array.isArray(sponsorResult.data) ? sponsorResult.data as Array<{ organisation_id: string; organisation_name: string; owner_username: string; campaign_id: string | null; campaign_name: string | null; campaign_status: string | null; question_text: string | null }> : [];
  const adminError = Boolean(termResult.error || accountResult.error || auditResult.error || sponsorResult.error);
  const pendingReports = queueResult.data ?? [];
  const activeTerms = terms?.filter((term) => term.is_active).length ?? 0;
  const activeCampaigns = sponsors.filter((row) => row.campaign_status === "active").length;

  return <main id="moderation-auto" className="p-5">
    <h1 className="title">Administration</h1><p className="body-copy mt-2">Les outils essentiels d’Ekoa, réservés à votre compte administrateur.</p>
    <nav className="admin-dashboard mt-6" aria-label="Sections administratives"><a href="#moderation-auto"><strong>{automatedQueues.pending.length + automatedQueues.rewrite.length}</strong><span>Questions à valider</span></a><a href="#signalements"><strong>{pendingReports.length}</strong><span>Signalements</span></a><a href="#comptes"><strong>⌕</strong><span>Comptes</span></a><a href="#termes"><strong>{activeTerms}</strong><span>Termes actifs</span></a><a href="#sponsoring"><strong>{activeCampaigns}</strong><span>Campagnes actives</span></a><a href="#audit"><strong>{audit?.length ?? 0}</strong><span>Actions auditées</span></a></nav>

    <section className="mt-9" aria-labelledby="automated-title">
      <div className="flex items-center justify-between gap-3"><h2 id="automated-title" className="text-2xl font-bold">Questions proposées</h2><span className="eyebrow">{automatedQueues.pending.length} en attente</span></div>
      <nav className="moderation-tabs mt-4" aria-label="File de modération automatique">
        <a aria-current={tab === "pending" ? "page" : undefined} href="?moderation=pending#moderation-auto">En attente <span>{automatedQueues.pending.length}</span></a>
        <a aria-current={tab === "rewrite" ? "page" : undefined} href="?moderation=rewrite#moderation-auto">Réécriture <span>{automatedQueues.rewrite.length}</span></a>
        <a aria-current={tab === "urgent" ? "page" : undefined} href="?moderation=urgent#moderation-auto">Urgentes <span>{automatedQueues.urgent.length}</span></a>
        <a aria-current={tab === "history" ? "page" : undefined} href="?moderation=history#moderation-auto">Historique <span>{automatedHistory.length}</span></a>
      </nav>
      {automatedError ? <div role="alert" className="error-state mt-5">Le dashboard de modération est momentanément indisponible.</div> : tab === "history" ? <AutomatedHistory items={automatedHistory} /> : <AutomatedQueueCards items={automatedQueues[tab]} />}
    </section>

    <section id="signalements" className="mt-12 scroll-mt-24 border-t border-black/10 pt-8"><div className="flex items-center justify-between gap-3"><h2 className="text-2xl font-bold">Signalements</h2><span className="eyebrow">{pendingReports.length} en attente</span></div>{queueResult.error ? <div role="alert" className="error-state mt-5">Impossible de charger les signalements.</div> : <ReportItems items={pendingReports as QueueItem[]} empty="Aucun signalement en attente." />}
      <details className="mt-7"><summary className="cursor-pointer text-lg font-bold">Contenus traités et restauration</summary><p className="mt-2 text-sm text-[var(--muted)]">Une nouvelle décision permet notamment de restaurer un contenu.</p><ReportItems items={(resolvedResult.data ?? []) as QueueItem[]} empty="Aucun contenu traité." /></details>
      <section className="mt-9" aria-labelledby="history"><h3 id="history" className="text-xl font-bold">Décisions récentes</h3>{historyResult.error ? <div role="alert" className="error-state mt-4">Historique indisponible.</div> : historyResult.data?.length ? <ul className="mt-4 space-y-2">{historyResult.data.map((row) => <li key={row.id} className="rounded-2xl border border-black/10 p-3 text-sm"><strong>{row.action}</strong> · {row.target_type}<p className="mt-1 text-[var(--muted)]">{row.reason}</p></li>)}</ul> : <div className="empty-state mt-4">Aucune décision enregistrée.</div>}</section>
    </section>

    <section className="mt-10 border-t border-black/10 pt-7" aria-labelledby="admin-tools"><h2 id="admin-tools" className="text-2xl font-bold">Outils administrateur</h2>{adminError ? <div role="alert" className="error-state mt-4">Certains outils sont indisponibles.</div> : null}
      <section id="comptes" className="mt-6 scroll-mt-24 rounded-3xl border border-black/10 p-5"><h3 className="text-xl font-bold">Comptes et certifications</h3><form className="mt-4 flex gap-2"><input className="field-input" name="compte" placeholder="Nom d’utilisateur" defaultValue={params.compte} /><button className="secondary-button">Rechercher</button></form>{params.compte && !account ? <p className="mt-3 text-sm text-[var(--muted)]">Aucun compte trouvé.</p> : null}{account ? <div className="mt-5"><p className="font-bold">@{account.username}</p><p className="text-sm text-[var(--muted)]">{account.role} · {account.account_type} · {account.account_status}</p><QuickVerificationForm userId={account.user_id} verified={account.account_type === "verified"} /><SuspensionForm userId={account.user_id} suspended={account.account_status === "suspended"} /><details className="mt-5"><summary className="cursor-pointer font-semibold">Informations avancées de certification</summary><VerificationForm userId={account.user_id} /></details></div> : null}</section>
      <section id="termes" className="mt-6 scroll-mt-24 rounded-3xl border border-black/10 p-5"><h3 className="text-xl font-bold">Termes interdits</h3><ForbiddenTermForm />{terms?.length ? <ul className="mt-4 space-y-2">{terms.map((term) => <li key={term.id} className="flex items-center justify-between rounded-2xl bg-[var(--background)] px-3 py-2 text-sm"><span>{term.term} · niveau {term.severity}</span><ForbiddenTermToggle term={term.term} severity={term.severity} active={term.is_active} /></li>)}</ul> : <p className="mt-4 text-sm text-[var(--muted)]">Aucun terme configuré.</p>}</section>
      <section id="sponsoring" className="mt-6 scroll-mt-24 rounded-3xl border border-black/10 p-5"><h3 className="text-xl font-bold">Sponsoring</h3><p className="mt-2 text-sm text-[var(--muted)]">Le politique et tout ciblage sensible ou fondé sur une réponse sont interdits.</p><details className="mt-4"><summary className="cursor-pointer font-semibold">Créer une organisation</summary><SponsorOrganisationForm defaultOwnerUserId={account?.account_type === "verified" ? account.user_id : undefined} /></details><details className="mt-4"><summary className="cursor-pointer font-semibold">Créer une campagne</summary><SponsorCampaignForm organisations={[...new Map(sponsors.map((row) => [row.organisation_id, { id: row.organisation_id, name: row.organisation_name }])).values()]} /></details>{sponsors.length ? <ul className="mt-5 space-y-3">{sponsors.filter((row) => row.campaign_id).map((row) => <li key={row.campaign_id} className="rounded-2xl bg-[var(--background)] p-4"><p className="font-bold">{row.campaign_name}</p><p className="text-sm text-[var(--muted)]">{row.organisation_name} · {row.campaign_status}</p><p className="mt-1 text-sm">{row.question_text}</p><SponsorCampaignStatusForm campaignId={row.campaign_id!} /></li>)}</ul> : <div className="empty-state mt-4">Aucune organisation sponsor.</div>}</section>
      <section id="audit" className="mt-6 scroll-mt-24 rounded-3xl border border-black/10 p-5"><h3 className="text-xl font-bold">Audit administratif</h3>{audit?.length ? <ul className="mt-4 space-y-2">{audit.map((row) => <li key={row.id} className="text-sm"><strong>{row.action}</strong> · {row.target_type}</li>)}</ul> : <div className="empty-state mt-4">Aucune action administrative.</div>}</section>
    </section>
  </main>;
}
