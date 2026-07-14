import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { generateCandidates as loadCandidates, loadAffinityInputs } from "./candidate-generator";
import { filterEligibleCandidates } from "./eligibility";
import { applyDeterministicExploration } from "./exploration";
import { scoreCandidates } from "./question-score";
import { reserveFeedItems as persistReservations, loadSessionHistory } from "./reservation";
import { rerankWithSessionConstraints } from "./session-reranker";
import { computeUserAffinity } from "./user-affinity";
import { RECOMMENDATION_CONFIG } from "./constants";
import type { DebugTrace, RerankedCandidate } from "./types";

export type RecommendationRequest = { db: SupabaseClient; userId: string; age: number; feed: "for_you"|"following"; categorySlug?: string; sessionId: string; snapshot: string };

export async function generateCandidates(request: RecommendationRequest) {
  return loadCandidates(request.db, { userId:request.userId,feed:request.feed,categorySlug:request.categorySlug,sessionId:request.sessionId,snapshot:request.snapshot });
}

export async function computeAffinity(request: RecommendationRequest, now: Date) {
  const inputs = await loadAffinityInputs(request.db,request.userId,now);
  return computeUserAffinity(inputs.signals,inputs.followedCategories,now);
}

export async function reserveFeedItems(request: RecommendationRequest, items: RerankedCandidate[]) {
  return persistReservations(request.db,request.userId,request.sessionId,items);
}

export function recordRankingDecision(items: RerankedCandidate[]) {
  return items.map((item) => ({questionId:item.questionId,sourcePool:item.sourcePool,finalScore:item.finalScore,scoreComponents:item.scoreComponents,appliedConstraints:item.appliedConstraints,relaxedConstraints:item.relaxedConstraints,rankingVersion:RECOMMENDATION_CONFIG.rankingVersion,experimentVariant:RECOMMENDATION_CONFIG.experimentVariant}));
}

export async function buildRecommendationBlock(request: RecommendationRequest, debug = false) {
  const startedAt = performance.now();
  const now = new Date(request.snapshot);
  const [candidates,affinity,history] = await Promise.all([generateCandidates(request),computeAffinity(request,now),loadSessionHistory(request.db,request.userId,request.sessionId)]);
  const sessionQuestionIds=new Set(history.map((item)=>item.questionId));
  const filtered=filterEligibleCandidates(candidates,{votedQuestionIds:new Set(),hiddenQuestionIds:new Set(),archivedQuestionIds:new Set(),reportedQuestionIds:new Set(),blockedAuthorIds:new Set(),sessionQuestionIds,age:request.age});
  const scored=scoreCandidates(filtered.eligible,affinity,now);
  const explored=applyDeterministicExploration(scored,request.sessionId);
  const selected=rerankWithSessionConstraints(explored,history,RECOMMENDATION_CONFIG.reservationSize);
  await reserveFeedItems(request,selected);
  const durationMs=Math.round((performance.now()-startedAt)*100)/100;
  const trace:DebugTrace|undefined=debug?{candidateCount:candidates.length,exclusions:filtered.exclusions,selected:selected.map((item)=>({questionId:item.questionId,score:item.finalScore,pool:item.sourcePool,relaxed:item.relaxedConstraints}))}:undefined;
  return{selected:recordRankingDecision(selected),durationMs,trace};
}
