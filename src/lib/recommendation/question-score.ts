import { RECOMMENDATION_CONFIG } from "./constants";
import type { AffinityProfile, Candidate, ScoreComponents, ScoredCandidate } from "./types";

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));
const rounded = (value: number) => Math.round(value * 100) / 100;

export function smoothedRate(successes: number, impressions: number, globalAverage: number, priorStrength = RECOMMENDATION_CONFIG.priorStrength) {
  return (successes + globalAverage * priorStrength) / (Math.max(0, impressions) + priorStrength);
}

function normalizedAffinity(weight: number) {
  return clamp01((weight - RECOMMENDATION_CONFIG.affinityBounds.min) / (RECOMMENDATION_CONFIG.affinityBounds.max - RECOMMENDATION_CONFIG.affinityBounds.min));
}

export function affinityPoints(candidate: Candidate, profile: AffinityProfile) {
  const category = normalizedAffinity(profile.categories.get(candidate.categoryId) ?? 0);
  const tags = candidate.tags.length ? candidate.tags.reduce((sum, tag) => sum + normalizedAffinity(profile.tags.get(tag) ?? 0), 0) / candidate.tags.length : normalizedAffinity(0);
  const universe = normalizedAffinity(profile.universes.get(candidate.universeId) ?? 0);
  const format = normalizedAffinity(profile.formats.get(candidate.format) ?? 0);
  const explicitBonus = candidate.followedCategory ? 0.12 : candidate.followedAuthor ? 0.06 : 0;
  return RECOMMENDATION_CONFIG.affinityWeight * clamp01(category * 0.5 + tags * 0.3 + universe * 0.1 + format * 0.1 + explicitBonus);
}

export function computeQuestionScore(candidate: Candidate, profile: AffinityProfile, now: Date): ScoredCandidate {
  const ageDays = Math.max(0, (now.getTime() - new Date(candidate.publishedAt).getTime()) / 86_400_000);
  const editorialQuality = RECOMMENDATION_CONFIG.editorialQualityWeight * clamp01(0.6 + candidate.publicationPriority / 250);
  const voteRate = smoothedRate(candidate.voteCount, candidate.impressionCount, 0.45);
  const upvoteRate = smoothedRate(candidate.upvoteCount, candidate.impressionCount, 0.08);
  const commentRate = smoothedRate(candidate.commentCount, candidate.impressionCount, 0.03);
  const fastSkipRate = smoothedRate(candidate.fastSkipCount, candidate.impressionCount, 0.15);
  const performance = RECOMMENDATION_CONFIG.performanceWeight * clamp01(voteRate * 0.45 + upvoteRate * 0.3 + commentRate * 0.25 - fastSkipRate * 0.1);
  const daysSinceShown = candidate.lastShownAt ? Math.max(0, (now.getTime() - new Date(candidate.lastShownAt).getTime()) / 86_400_000) : null;
  const noveltyRatio = daysSinceShown === null ? 1 : daysSinceShown > 30 ? 0.7 : daysSinceShown >= 7 ? 0.4 : daysSinceShown >= 1 ? 0.1 : 0;
  const explorationRatio = clamp01((RECOMMENDATION_CONFIG.priorStrength - Math.min(RECOMMENDATION_CONFIG.priorStrength, candidate.impressionCount)) / RECOMMENDATION_CONFIG.priorStrength * 0.75 + (candidate.sourcePool === "exploration" ? 0.25 : 0));
  const freshnessRatio = candidate.editorialType === "topical" ? Math.exp(-ageDays / 14) : 0.65 + 0.35 * Math.exp(-ageDays / 180);
  const unansweredRatio = candidate.impressionCount > 0 ? clamp01((candidate.impressionCount - candidate.voteCount) / candidate.impressionCount) : 0;
  const unansweredConfidence = candidate.impressionCount / (candidate.impressionCount + RECOMMENDATION_CONFIG.priorStrength);
  const unansweredPenalty = rounded(-12 * unansweredRatio * unansweredConfidence);
  const recentImpressionPenalty = daysSinceShown !== null && daysSinceShown < 1 ? -30 : daysSinceShown !== null && daysSinceShown < 7 ? -8 : 0;
  const scoreComponents: ScoreComponents = {
    affinity: rounded(affinityPoints(candidate, profile)),
    editorialQuality: rounded(editorialQuality),
    performance: rounded(performance),
    novelty: rounded(RECOMMENDATION_CONFIG.noveltyWeight * noveltyRatio),
    exploration: rounded(RECOMMENDATION_CONFIG.explorationWeight * explorationRatio),
    freshness: rounded(RECOMMENDATION_CONFIG.freshnessWeight * freshnessRatio),
    editorialPriority: rounded(RECOMMENDATION_CONFIG.editorialPriorityWeight * clamp01(candidate.publicationPriority / 100)),
    reportPenalty: 0,
    unansweredPenalty,
    recentImpressionPenalty,
  };
  const finalScore = candidate.adminFeatured ? 100 : rounded(Math.max(0, Math.min(100, Object.values(scoreComponents).reduce((sum, value) => sum + value, 0))));
  return { ...candidate, finalScore, scoreComponents };
}

export function scoreCandidates(candidates: Candidate[], profile: AffinityProfile, now: Date) {
  return candidates.map((candidate) => computeQuestionScore(candidate, profile, now)).sort((a, b) => b.finalScore - a.finalScore || a.questionId.localeCompare(b.questionId));
}
