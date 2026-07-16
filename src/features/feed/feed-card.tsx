"use client";

import { useEffect, useRef } from "react";
import { QuestionCard } from "@/features/voting/question-card";
import type { FeedItem, FeedType } from "./schema";
import type {ResultRow} from "@/features/voting/schema";

type Props = { item: FeedItem; feed: FeedType; rank: number; requestId: string; algorithmVersion: 1; initialResults?:ResultRow[] };

export function FeedCard({ item, feed, rank, requestId, algorithmVersion,initialResults }: Props) {
  const element = useRef<HTMLDivElement>(null);
  const impressionId = useRef(crypto.randomUUID());
  const visibleSince = useRef<number | null>(null);
  const impressed = useRef(false);

  useEffect(() => {
    const node = element.current;
    if (!node) return;
    const send = (eventType: "impression" | "skip" | "dwell", dwellMs?: number) => {
      void fetch("/api/events", { method: "POST", headers: { "content-type": "application/json" }, keepalive: true, body: JSON.stringify({ eventId: crypto.randomUUID(), eventType, questionId: item.question_id, impressionId: impressionId.current, feed, algorithmVersion, rank, requestId, occurredAt: new Date().toISOString(), ...(dwellMs === undefined ? {} : { dwellMs }) }) });
    };
    const leave = () => {
      if (!impressed.current || visibleSince.current === null) return;
      const duration = Math.min(300_000, Math.max(0, Math.round(performance.now() - visibleSince.current)));
      visibleSince.current = null;
      send("dwell", duration);
      send("skip");
    };
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting && entry.intersectionRatio >= 0.6) {
        if (!impressed.current) { impressed.current = true; send("impression"); }
        if (visibleSince.current === null) visibleSince.current = performance.now();
      } else leave();
    }, { threshold: [0, 0.6] });
    observer.observe(node);
    const onVisibility = () => { if (document.visibilityState === "hidden") leave(); };
    document.addEventListener("visibilitychange", onVisibility);
    return () => { leave(); observer.disconnect(); document.removeEventListener("visibilitychange", onVisibility); };
  }, [algorithmVersion, feed, item.question_id, rank, requestId]);

  return <div ref={element} className="h-[calc(100dvh-4.75rem)] snap-start snap-always">
    <QuestionCard questionId={item.question_id} question={item.question_text} category={item.category_name} authorId={item.author_id} author={item.author_username} verified={item.author_verified} options={item.options} initialResults={initialResults} initiallyFollowed={item.initially_followed} initiallyUpvoted={item.initially_upvoted} initialUpvoteCount={item.upvote_count} sponsoredBy={item.sponsored_by} headingLevel="h2" immersive />
  </div>;
}
