import Link from "next/link";
import { requireAdmin } from "@/features/auth/authorization";
import {
  QuickVerificationForm,
  SuspensionForm,
  VerificationForm,
} from "@/features/moderation/admin-forms";
import { ModerationForm } from "@/features/moderation/moderation-form";
import { accountSearchSchema } from "@/features/moderation/schema";
import {
  SponsorCampaignForm,
  SponsorCampaignStatusForm,
  SponsorOrganisationForm,
} from "@/features/sponsorship/admin-forms";

type QueueItem = {
  report_id: string;
  target_type: "question" | "comment";
  target_id: string;
  reason: string;
  details: string | null;
  status: string;
  created_at: string;
  target_excerpt: string | null;
  report_count: number;
};

function ReportItems({ items, empty }: { items: QueueItem[]; empty: string }) {
  if (!items.length) return <div className="empty-state mt-4">{empty}</div>;

  return (
    <ul className="mt-4 space-y-4">
      {items.map((item) => (
        <li
          key={item.report_id}
          className="rounded-3xl border border-black/10 p-5"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="eyebrow">
              {item.target_type === "question" ? "Question" : "Commentaire"}
            </span>
            <span className="rounded-full bg-[var(--accent-soft)] px-3 py-1 text-xs font-bold text-[var(--accent)]">
              {item.report_count} {item.report_count > 1 ? "signalements" : "signalement"}
            </span>
            <time
              className="text-xs text-[var(--muted)]"
              dateTime={item.created_at}
            >
              {new Date(item.created_at).toLocaleDateString("fr-FR")}
            </time>
          </div>
          <p className="mt-4 font-bold">
            {item.target_excerpt ?? "Contenu indisponible"}
          </p>
          {item.target_type === "question" &&
          ["pending", "reviewing"].includes(item.status) ? (
            <Link
              href={`/questions/${item.target_id}`}
              className="mt-3 inline-block text-sm font-semibold underline"
            >
              Voir la question
            </Link>
          ) : null}
          <p className="mt-2 text-sm">
            <strong>
              {item.report_count > 1 ? "Premier motif :" : "Motif :"}
            </strong>{" "}
            {item.reason}
          </p>
          {item.details ? (
            <p className="mt-2 rounded-xl bg-[var(--background)] p-3 text-sm">
              {item.details}
            </p>
          ) : null}
          <ModerationForm
            reportId={item.report_id}
            targetType={item.target_type}
          />
        </li>
      ))}
    </ul>
  );
}

type SponsorRow = {
  organisation_id: string;
  organisation_name: string;
  owner_username: string;
  campaign_id: string | null;
  campaign_name: string | null;
  campaign_status: string | null;
  question_text: string | null;
};

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ compte?: string }>;
}) {
  const { supabase } = await requireAdmin();
  const params = await searchParams;
  const accountName = accountSearchSchema.safeParse(params.compte);

  const [
    { data: queue, error: queueError },
    { data: resolved, error: resolvedError },
    { data: history, error: historyError },
  ] = await Promise.all([
    supabase.rpc("get_moderation_queue", {
      requested_status: "pending",
      requested_limit: 50,
    }),
    supabase.rpc("get_moderation_queue", {
      requested_status: "resolved",
      requested_limit: 10,
    }),
    supabase
      .from("moderation_actions")
      .select("id,action,target_type,target_id,reason,created_at")
      .order("created_at", { ascending: false })
      .limit(20),
  ]);

  const [accountResult, auditResult, sponsorResult] = await Promise.all([
    accountName.success
      ? supabase.rpc("admin_find_account", {
          requested_username: accountName.data,
        })
      : Promise.resolve({ data: null, error: null }),
    supabase
      .from("audit_log")
      .select("id,action,target_type,created_at")
      .order("created_at", { ascending: false })
      .limit(20),
    supabase.rpc("get_admin_sponsor_overview"),
  ]);

  const account = Array.isArray(accountResult.data)
    ? (accountResult.data[0] as
        | {
            user_id: string;
            username: string;
            role: string;
            account_type: string;
            account_status: string;
          }
        | undefined)
    : undefined;
  const audit = Array.isArray(auditResult.data)
    ? (auditResult.data as Array<{
        id: string;
        action: string;
        target_type: string;
        created_at: string;
      }>)
    : null;
  const sponsors = Array.isArray(sponsorResult.data)
    ? (sponsorResult.data as SponsorRow[])
    : [];
  const adminError = Boolean(
    accountResult.error || auditResult.error || sponsorResult.error,
  );
  const pendingItems = (queue ?? []) as QueueItem[];
  const resolvedItems = (resolved ?? []) as QueueItem[];
  const pendingCount = pendingItems.length;
  const activeCampaigns = sponsors.filter(
    (row) => row.campaign_status === "active",
  ).length;

  return (
    <main id="signalements" className="p-5">
      <h1 className="title">Administration</h1>
      <p className="body-copy mt-2">
        Les outils essentiels d’Ekoa, réservés à votre compte administrateur.
      </p>

      <nav
        className="admin-dashboard mt-6"
        aria-label="Sections administratives"
      >
        <a href="#signalements">
          <strong>{pendingCount}</strong>
          <span>À décider</span>
        </a>
        <a href="#comptes">
          <strong>⌕</strong>
          <span>Comptes</span>
        </a>
        <a href="#sponsoring">
          <strong>{activeCampaigns}</strong>
          <span>Campagnes actives</span>
        </a>
        <a href="#audit">
          <strong>{audit?.length ?? 0}</strong>
          <span>Actions auditées</span>
        </a>
      </nav>

      <div className="mt-9 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold">À traiter</h2>
          <p className="mt-2 text-sm text-[var(--muted)]">
            Une question apparaît ici au troisième signalement distinct et reste
            publiée jusqu’à votre décision.
          </p>
        </div>
        <span className="eyebrow">{pendingCount} en attente</span>
      </div>
      {queueError ? (
        <div role="alert" className="error-state mt-5">
          Impossible de charger les signalements.
        </div>
      ) : (
        <ReportItems
          items={pendingItems}
          empty="Aucun contenu à traiter."
        />
      )}

      <details className="mt-7">
        <summary className="cursor-pointer text-lg font-bold">
          Contenus traités et restauration
        </summary>
        <p className="mt-2 text-sm text-[var(--muted)]">
          Une nouvelle décision permet notamment de restaurer un contenu.
        </p>
        {resolvedError ? (
          <div role="alert" className="error-state mt-4">
            Impossible de charger les contenus traités.
          </div>
        ) : (
          <ReportItems
            items={resolvedItems}
            empty="Aucun contenu traité."
          />
        )}
      </details>

      <section className="mt-9" aria-labelledby="history">
        <h2 id="history" className="text-xl font-bold">
          Décisions récentes
        </h2>
        {historyError ? (
          <div role="alert" className="error-state mt-4">
            Historique indisponible.
          </div>
        ) : history?.length ? (
          <ul className="mt-4 space-y-2">
            {history.map((row) => (
              <li
                key={row.id}
                className="rounded-2xl border border-black/10 p-3 text-sm"
              >
                <strong>{row.action}</strong> · {row.target_type}
                <p className="mt-1 text-[var(--muted)]">{row.reason}</p>
              </li>
            ))}
          </ul>
        ) : (
          <div className="empty-state mt-4">Aucune décision enregistrée.</div>
        )}
      </section>

      <section
        className="mt-10 border-t border-black/10 pt-7"
        aria-labelledby="admin-tools"
      >
        <h2 id="admin-tools" className="text-2xl font-bold">
          Outils administrateur
        </h2>
        {adminError ? (
          <div role="alert" className="error-state mt-4">
            Certains outils sont indisponibles.
          </div>
        ) : null}

        <section
          id="comptes"
          className="mt-6 scroll-mt-24 rounded-3xl border border-black/10 p-5"
        >
          <h3 className="text-xl font-bold">Comptes et certifications</h3>
          <form className="mt-4 flex gap-2">
            <input
              className="field-input"
              name="compte"
              placeholder="Nom d’utilisateur"
              defaultValue={params.compte}
            />
            <button className="secondary-button">Rechercher</button>
          </form>
          {params.compte && !account ? (
            <p className="mt-3 text-sm text-[var(--muted)]">
              Aucun compte trouvé.
            </p>
          ) : null}
          {account ? (
            <div className="mt-5">
              <p className="font-bold">@{account.username}</p>
              <p className="text-sm text-[var(--muted)]">
                {account.role} · {account.account_type} · {account.account_status}
              </p>
              <QuickVerificationForm
                userId={account.user_id}
                verified={account.account_type === "verified"}
              />
              <SuspensionForm
                userId={account.user_id}
                suspended={account.account_status === "suspended"}
              />
              <details className="mt-5">
                <summary className="cursor-pointer font-semibold">
                  Informations avancées de certification
                </summary>
                <VerificationForm userId={account.user_id} />
              </details>
            </div>
          ) : null}
        </section>

        <section
          id="sponsoring"
          className="mt-6 scroll-mt-24 rounded-3xl border border-black/10 p-5"
        >
          <h3 className="text-xl font-bold">Sponsoring</h3>
          <p className="mt-2 text-sm text-[var(--muted)]">
            Le politique et tout ciblage sensible ou fondé sur une réponse sont
            interdits.
          </p>
          <details className="mt-4">
            <summary className="cursor-pointer font-semibold">
              Créer une organisation
            </summary>
            <SponsorOrganisationForm
              defaultOwnerUserId={
                account?.account_type === "verified"
                  ? account.user_id
                  : undefined
              }
            />
          </details>
          <details className="mt-4">
            <summary className="cursor-pointer font-semibold">
              Créer une campagne
            </summary>
            <SponsorCampaignForm
              organisations={[
                ...new Map(
                  sponsors.map((row) => [
                    row.organisation_id,
                    { id: row.organisation_id, name: row.organisation_name },
                  ]),
                ).values(),
              ]}
            />
          </details>
          {sponsors.length ? (
            <ul className="mt-5 space-y-3">
              {sponsors
                .filter((row) => row.campaign_id)
                .map((row) => (
                  <li
                    key={row.campaign_id}
                    className="rounded-2xl bg-[var(--background)] p-4"
                  >
                    <p className="font-bold">{row.campaign_name}</p>
                    <p className="text-sm text-[var(--muted)]">
                      {row.organisation_name} · {row.campaign_status}
                    </p>
                    <p className="mt-1 text-sm">{row.question_text}</p>
                    <SponsorCampaignStatusForm
                      campaignId={row.campaign_id!}
                    />
                  </li>
                ))}
            </ul>
          ) : (
            <div className="empty-state mt-4">
              Aucune organisation sponsor.
            </div>
          )}
        </section>

        <section
          id="audit"
          className="mt-6 scroll-mt-24 rounded-3xl border border-black/10 p-5"
        >
          <h3 className="text-xl font-bold">Audit administratif</h3>
          {audit?.length ? (
            <ul className="mt-4 space-y-2">
              {audit.map((row) => (
                <li key={row.id} className="text-sm">
                  <strong>{row.action}</strong> · {row.target_type}
                </li>
              ))}
            </ul>
          ) : (
            <div className="empty-state mt-4">
              Aucune action administrative.
            </div>
          )}
        </section>
      </section>
    </main>
  );
}
