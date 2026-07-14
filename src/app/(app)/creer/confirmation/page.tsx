import Link from "next/link";
import { notFound } from "next/navigation";
import { requireActiveProfile } from "@/features/auth/authorization";

export default async function ConfirmationPage({ searchParams }: { searchParams: Promise<{ id?: string }> }) {
  const { supabase, profile } = await requireActiveProfile(); const { id } = await searchParams;
  if (!id) notFound();
  const { data } = await supabase.from("questions").select("text").eq("id", id).eq("author_id", profile.user_id).eq("status", "published").maybeSingle();
  if (!data) notFound();
  return <main className="p-5"><section className="rounded-3xl bg-[var(--accent-soft)] p-6"><p className="eyebrow">Publication réussie</p><h1 className="title mt-5">Votre question est publiée</h1><p className="mt-4 font-semibold">{data.text}</p><p className="body-copy mt-3">Elle pourra recevoir des réponses à partir de la phase de vote.</p><div className="mt-6 flex gap-3"><Link href="/profil" className="secondary-button flex-1">Voir mon profil</Link><Link href="/creer" className="primary-button flex-1">Créer une autre</Link></div></section></main>;
}
