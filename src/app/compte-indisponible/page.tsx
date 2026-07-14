import { signOut } from "@/features/auth/actions";

export default function UnavailableAccountPage() {
  return (
    <main className="page-center">
      <section className="card" aria-labelledby="unavailable-title">
        <p className="eyebrow">Compte</p>
        <h1 id="unavailable-title" className="title">Compte indisponible</h1>
        <p className="body-copy">Ce compte ne peut pas accéder à Ekoa actuellement.</p>
        <form action={signOut} className="mt-6">
          <button className="secondary-button" type="submit">Se déconnecter</button>
        </form>
      </section>
    </main>
  );
}
