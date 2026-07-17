"use client";

import { useActionState } from "react";
import Link from "next/link";
import { submitVote, toggleFollow, toggleUpvote, type ToggleState, type VoteState } from "./actions";
import type { ResultRow } from "./schema";
import { formatPercentage, resultBarWidth } from "./results";
import { CommentsSection } from "@/features/comments/comments-section";
import { CommentsSheet } from "@/features/comments/comments-sheet";
import { ReportForm } from "@/features/reports/report-form";
import { ProfileAvatar } from "@/features/profile/avatar";
import { Icon } from "@/components/ui/icon";

type Option = { id: string; text: string };
type Props = { questionId: string; question: string; category: string; authorId: string; author: string; verified: boolean; admin: boolean; options: Option[]; initialResults?: ResultRow[]; initiallyFollowed: boolean; initiallyUpvoted?: boolean; initialUpvoteCount?: number; headingLevel?: "h1" | "h2"; showComments?: boolean; sponsoredBy?:string|null; immersive?:boolean };

export function QuestionCard(props: Props) {
  const Heading = props.headingLevel ?? "h1";
  const initialVote: VoteState = props.initialResults ? { status: "success", message: "", results: props.initialResults } : { status: "idle", message: "" };
  const [vote, voteAction, votePending] = useActionState(submitVote, initialVote);
  const resultRows = vote.results ?? props.initialResults;
  const initialUpvoted = resultRows?.[0]?.is_upvoted ?? props.initiallyUpvoted ?? false;
  const initialUpvoteCount = resultRows?.[0]?.question_upvote_count ?? props.initialUpvoteCount ?? 0;
  const [follow, followAction, followPending] = useActionState(toggleFollow, { status: "idle", message: "", enabled: props.initiallyFollowed } satisfies ToggleState);
  const [upvote, upvoteAction, upvotePending] = useActionState(toggleUpvote, { status: "idle", message: "", enabled: initialUpvoted, count: initialUpvoteCount } satisfies ToggleState);
  const upvoteCount = upvote.count ?? resultRows?.[0]?.question_upvote_count ?? props.initialUpvoteCount ?? 0;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";

  return <article className={props.immersive?"feed-question-card":"rounded-3xl border border-black/10 bg-white p-5 shadow-sm"} aria-labelledby={`question-${props.questionId}`}>
    {props.sponsoredBy?<p className="mb-4 rounded-2xl border border-black bg-[var(--accent)] px-4 py-3 text-sm font-bold">Question sponsorisée par {props.sponsoredBy}</p>:null}
    <div className={props.immersive?"feed-question-scroll":""}><div className={props.immersive?"feed-question-copy":""}><div className="flex flex-wrap items-center gap-2"><span className="eyebrow">{props.category}</span>{props.immersive?null:<p className="text-sm font-semibold text-[var(--muted)]">{props.author === "membre supprimé" ? "Membre supprimé" : <Link href={`/profils/${props.author}`} className="underline">@{props.author}</Link>}{props.verified ? " · ✓ Vérifié" : ""}</p>}</div>
    <Heading id={`question-${props.questionId}`} className={props.immersive?"mt-4 text-[clamp(1.65rem,7vw,2.4rem)] font-black leading-[1.08] tracking-[-0.035em] text-[var(--foreground)]":"mt-6 text-2xl font-bold leading-tight"}>{props.question}</Heading>
    {resultRows ? <div className={props.immersive?"feed-results mt-5 space-y-2.5":"mt-6 space-y-3"}>{resultRows.map((result) => <div key={result.option_id} className={`relative overflow-hidden rounded-2xl border p-4 ${result.is_selected?"border-[#a9b9e8]":"border-[var(--border)]"}`}><div className="absolute inset-y-0 left-0 bg-[var(--accent-soft)]" style={{ width: resultBarWidth(result.percentage) }} aria-hidden="true" /><div className="relative flex justify-between gap-3"><span className="font-semibold">{result.option_text}{result.is_selected ? " · Votre réponse" : ""}</span><span className="font-bold">{formatPercentage(result.percentage)} %</span></div></div>)}<p className="text-sm text-[var(--muted)]">{resultRows[0].total_vote_count} {resultRows[0].total_vote_count > 1 ? "réponses" : "réponse"} de la communauté Ekoa</p></div> : <form action={voteAction} className={props.immersive?"feed-answer-form mt-5 space-y-2.5":"mt-6 space-y-3"}><input type="hidden" name="questionId" value={props.questionId} />{props.options.map((option) => <button key={option.id} type="submit" name="optionId" value={option.id} disabled={votePending} className={props.immersive?"feed-answer-button":"secondary-button min-h-14 w-full justify-start text-left"}>{option.text}</button>)}{props.immersive?null:<p className="text-center text-xs leading-5 text-[var(--muted)]">Votre réponse est définitive. Les résultats apparaîtront après votre vote.</p>}</form>}</div></div>
    {props.immersive?<div className="feed-report-action"><ReportForm targetType="question" targetId={props.questionId} label="Signaler cette question" compact /></div>:null}
    <div className={props.immersive?"feed-action-rail":"mt-5 grid grid-cols-2 gap-2 border-t border-black/10 pt-4 sm:grid-cols-3"} aria-label="Actions de la question">
      {props.immersive?(props.author === "membre supprimé"?<ProfileAvatar userId={props.authorId} username={props.author} supabaseUrl={supabaseUrl} className="feed-author-avatar" />:<Link href={`/profils/${props.author}`} className="feed-author-avatar-link" aria-label={`Voir le profil de ${props.author}`}><ProfileAvatar userId={props.authorId} username={props.author} supabaseUrl={supabaseUrl} className="feed-author-avatar" verified={props.verified} admin={props.admin}/></Link>):null}
      <form action={upvoteAction} className="flex-1">
        <input type="hidden" name="questionId" value={props.questionId} />
        <input type="hidden" name="enabled" value={String(!upvote.enabled)} />
        <button type="submit" disabled={upvotePending} className={props.immersive?`feed-rail-button ${upvote.enabled?"feed-rail-button-active":""}`:`secondary-button compact w-full gap-2 ${upvote.enabled ? "border-black bg-[var(--accent)]" : ""}`} aria-pressed={upvote.enabled} aria-label={`${upvote.enabled ? "Retirer l’upvote" : "Upvoter la question"}. ${upvoteCount} upvote${upvoteCount > 1 ? "s" : ""}`}>
          <span><Icon name="arrow-up" /></span><span>Upvote</span><span className="tabular-nums">{upvoteCount}</span>
        </button>
      </form>
      <form action={followAction} className="flex-1">
        <input type="hidden" name="questionId" value={props.questionId} />
        <input type="hidden" name="enabled" value={String(!follow.enabled)} />
        <button type="submit" disabled={followPending} className={props.immersive?`feed-rail-button ${follow.enabled?"feed-rail-button-active":""}`:`secondary-button compact w-full gap-2 ${follow.enabled ? "border-black bg-[var(--accent-soft)]" : ""}`} aria-pressed={follow.enabled}>
          <span aria-hidden="true">{follow.enabled ? "✓" : "+"}</span><span>{follow.enabled ? "Question suivie" : "Suivre"}</span>
        </button>
      </form>
      {props.immersive?<CommentsSheet questionId={props.questionId}/>:<Link href={`/questions/${props.questionId}#comments-${props.questionId}`} className="secondary-button compact col-span-2 gap-2 sm:col-span-1" aria-label="Afficher les commentaires de cette question"><Icon name="comment" /><span>Commentaires</span></Link>}
    </div>
    <div className={props.immersive?"feed-action-feedback":""}>
      {vote.message ? <p key={`${vote.status}-${vote.message}`} role={vote.status === "error" ? "alert" : "status"} className={vote.status === "error" ? "field-error" : "mt-4 text-sm text-green-800"}>{vote.message}</p> : null}
      {follow.message ? <p key={`${follow.status}-${follow.message}`} role={follow.status === "error" ? "alert" : "status"} className={follow.status === "error" ? "field-error" : "mt-3 text-sm text-green-800"}>{follow.message}</p> : null}
      {upvote.message ? <p key={`${upvote.status}-${upvote.message}`} role={upvote.status === "error" ? "alert" : "status"} className={upvote.status === "error" ? "field-error" : "mt-3 text-sm text-green-800"}>{upvote.message}</p> : null}
    </div>
    {props.immersive?null:<ReportForm targetType="question" targetId={props.questionId} label="Signaler cette question" />}
    {props.showComments ? <CommentsSection questionId={props.questionId} /> : null}
  </article>;
}
