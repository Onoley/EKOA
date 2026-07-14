import Link from "next/link";

export default function AuthErrorPage() {
  return (
    <main className="page-center">
      <section className="card" aria-labelledby="auth-error-title">
        <p className="eyebrow">Connexion</p>
        <h1 id="auth-error-title" className="title">Ce lien n’est plus valide</h1>
        <p className="body-copy">Recommencez la confirmation de votre adresse ou la réinitialisation de votre mot de passe.</p>
        <Link href="/" className="primary-button mt-6">Retour à la connexion</Link>
      </section>
    </main>
  );
}
