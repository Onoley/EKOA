import { redirect } from "next/navigation";
import { BrandLogo } from "@/components/ui/brand-logo";
import { NewPasswordForm } from "@/features/auth/password-reset-form";
import { createClient } from "@/lib/supabase/server";

export default async function NewPasswordPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/erreur");
  return <main className="page-center bg-white sm:bg-[var(--background)]"><section className="card" aria-labelledby="password-title"><BrandLogo className="h-auto w-28" priority /><h1 id="password-title" className="title mt-8">Choisir un nouveau mot de passe</h1><p className="body-copy mt-3">Votre nouveau mot de passe remplacera l’ancien dès son enregistrement.</p><NewPasswordForm /></section></main>;
}
