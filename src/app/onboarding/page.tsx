import { redirect } from "next/navigation";
import { getSessionContext } from "@/features/auth/authorization";
import { OnboardingForm } from "@/features/onboarding/onboarding-form";
import { BrandLogo } from "@/components/ui/brand-logo";

export default async function OnboardingPage() {
  const { userId, profile, supabase } = await getSessionContext();
  if (!userId) redirect("/");
  if (profile?.account_status === "active") redirect("/fil");
  if (profile && profile.account_status !== "pending_onboarding") redirect("/compte-indisponible");

  const { data: categories, error } = await supabase.from("categories")
    .select("id,name,description,universes(name,display_order)").eq("is_active", true).order("display_order");
  const categoryRows=(categories??[]).map((category)=>{const universe=Array.isArray(category.universes)?category.universes[0]:category.universes;return{id:category.id,name:category.name,description:category.description,universeName:universe?.name??"Autres",universeOrder:universe?.display_order??99}}).sort((a,b)=>a.universeOrder-b.universeOrder);

  return (
    <main className="mx-auto min-h-dvh w-full max-w-xl px-5 py-8 sm:py-12">
      <BrandLogo className="h-auto w-28" priority />
      <p className="eyebrow mt-6">Bienvenue sur Ekoa</p>
      <h1 className="title mt-4">Créons votre profil</h1>
      <p className="body-copy mt-3 mb-8">Vos informations démographiques restent privées.</p>
      {error ? <div role="alert" className="error-state">Impossible de charger les catégories. Actualisez la page.</div> : categoryRows.length ? <OnboardingForm categories={categoryRows} /> : <div role="status" className="empty-state">Aucune catégorie n’est disponible actuellement.</div>}
    </main>
  );
}
