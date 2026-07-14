import { BrandLogo } from "@/components/ui/brand-logo";
import { PasswordResetRequestForm } from "@/features/auth/password-reset-form";

export default function ForgotPasswordPage() {
  return <main className="page-center bg-white sm:bg-[var(--background)]"><section className="card" aria-labelledby="forgot-title"><BrandLogo className="h-auto w-28" priority /><h1 id="forgot-title" className="title mt-8">Mot de passe oublié</h1><p className="body-copy mt-3">Saisissez votre adresse e-mail pour recevoir un lien sécurisé.</p><PasswordResetRequestForm /></section></main>;
}
