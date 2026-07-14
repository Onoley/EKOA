import { redirect } from "next/navigation";
import { SignInForm } from "@/features/auth/sign-in-form";
import { getSessionContext } from "@/features/auth/authorization";
import { hasSupabaseEnv } from "@/lib/config/env";
import { BrandLogo } from "@/components/ui/brand-logo";

export default async function Home() {
  const configured = hasSupabaseEnv();
  if (configured) {
    const { userId, profile } = await getSessionContext();
    if (userId && profile?.account_status === "active") redirect("/fil");
    if (userId && (!profile || profile.account_status === "pending_onboarding")) redirect("/onboarding");
    if (userId) redirect("/compte-indisponible");
  }

  return (
    <main className="page-center bg-white sm:bg-[var(--background)]">
      <section className="card" aria-labelledby="welcome-title">
        <BrandLogo className="h-auto w-32" priority />
        <h1 id="welcome-title" className="mt-10 text-4xl font-bold tracking-[-0.05em]">Répondez.<br />Comparez.<br />Comprenez.</h1>
        <p className="body-copy mt-6">Découvrez ce que pense la communauté Ekoa. Ces réponses ne constituent pas un sondage statistiquement représentatif.</p>
        {configured ? <SignInForm /> : (
          <div role="status" className="mt-8 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
            La configuration Supabase est requise pour ouvrir les connexions.
          </div>
        )}
        <p className="mt-6 text-center text-xs text-[var(--muted)]">Ekoa est réservé aux personnes de 18 ans ou plus.</p>
      </section>
    </main>
  );
}
