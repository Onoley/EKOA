"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type UIEvent } from "react";
import type { FeedItem, FeedType } from "./schema";
import { FeedCard } from "./feed-card";
import type {ResultRow} from "@/features/voting/schema";

type Page = { items: FeedItem[]; nextCursor: string | null; requestId: string; algorithmVersion: 1 };

type InitialQuestion={item:FeedItem;results?:ResultRow[];requestId:string};

export function Feed({ type, category,initialQuestion }: { type: FeedType; category?: { slug: string; name: string };initialQuestion?:InitialQuestion }) {
  const [pages, setPages] = useState<Page[]>([]);
  const [cursor, setCursor] = useState<string | null | undefined>(undefined);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const loading = useRef(false);

  const load = useCallback(async (next?: string | null) => {
    if (loading.current || next === null) return;
    loading.current = true; setStatus("loading");
    try {
      const params = new URLSearchParams({ type });
      if (category) params.set("category", category.slug);
      if (next) params.set("cursor", next);
      const response = await fetch(`/api/feed?${params}`);
      if (!response.ok) throw new Error();
      const page = await response.json() as Page;
      setPages((current) => next ? [...current, page] : [page]);
      setCursor(page.nextCursor); setStatus("ready");
    } catch { setStatus("error"); }
    finally { loading.current = false; }
  }, [category, type]);

  useEffect(() => {
    // The first page is an authenticated HTTP resource and intentionally starts after hydration.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);
  const handleScroll = useCallback((event: UIEvent<HTMLElement>) => {
    if (!cursor || loading.current) return;
    const { scrollTop, scrollHeight, clientHeight } = event.currentTarget;
    if (scrollHeight - scrollTop - clientHeight <= clientHeight * 2) void load(cursor);
  }, [cursor, load]);

  let sequenceRank = 0;
  const items=[...(initialQuestion?[{item:initialQuestion.item,rank:sequenceRank++,requestId:initialQuestion.requestId,algorithmVersion:1 as const,initialResults:initialQuestion.results}]:[]),...pages.flatMap((page) => page.items.filter((item)=>item.question_id!==initialQuestion?.item.question_id).map((item) => ({ item, rank: sequenceRank++, requestId: page.requestId, algorithmVersion: page.algorithmVersion,initialResults:undefined })))];
  return <main className="relative bg-white text-[var(--foreground)]">
    {category ? <header className="feed-topbar feed-category-header"><Link href="/explorer" className="feed-back-button" aria-label="Retour à Explorer">←</Link><div><p className="text-[0.65rem] font-bold uppercase tracking-[0.18em] text-[var(--muted)]">Catégorie</p><h1 className="font-bold">{category.name}</h1></div></header> : <nav className="feed-topbar feed-tabs" aria-label="Type de fil">
      <Link href="/fil" aria-current={type === "for_you" ? "page" : undefined} className={`feed-tab ${type === "for_you" ? "feed-tab-active" : ""}`}>Pour toi</Link>
      <Link href="/fil?mode=suivis" aria-current={type === "following" ? "page" : undefined} className={`feed-tab ${type === "following" ? "feed-tab-active" : ""}`}>Suivis</Link>
    </nav>}
    <section onScroll={handleScroll} aria-label={category ? `Questions de la catégorie ${category.name}` : type === "for_you" ? "Questions pour vous" : "Questions suivies"} className="feed-viewport h-[calc(100dvh-4.75rem)] snap-y snap-mandatory overflow-y-auto overscroll-contain">
      {items.map(({ item, ...context }) => <FeedCard key={item.question_id} item={item} feed={type} {...context} />)}
      {status === "loading" ? <div className="flex min-h-40 items-center justify-center p-6" role="status">Chargement des questions…</div> : null}
      {status === "error" ? <div className="empty-state m-5" role="alert"><h1 className="text-xl font-bold">Impossible de charger le fil</h1><p className="body-copy mt-2">Vérifiez votre connexion puis réessayez.</p><button className="primary-button mt-5" onClick={() => void load(cursor)}>Réessayer</button></div> : null}
      {status === "ready" && items.length === 0 ? <div className="empty-state m-5"><h1 className="text-xl font-bold">Les premières questions arrivent bientôt.</h1><p className="body-copy mt-2">{category ? `La catégorie ${category.name} est prête à accueillir ses premières questions.` : type === "following" ? "Vos nouvelles catégories suivies apparaîtront ici dès qu’une question sera publiée." : "La nouvelle taxonomie Ekoa est installée. Aucun contenu artificiel ne sera ajouté."}</p></div> : null}
      {status === "ready" && items.length > 0 && cursor === null ? <p className="p-8 text-center text-sm text-[var(--muted)]">Vous avez vu toutes les questions disponibles.</p> : null}
    </section>
  </main>;
}
