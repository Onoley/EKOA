import type { FeedCandidate } from "./schema";

export type RankedCandidate = FeedCandidate & { score: number; reasons: string[] };

function seededExploration(id: string, seed: string) {
  let hash = 2166136261;
  for (const char of `${seed}:${id}`) { hash ^= char.charCodeAt(0); hash = Math.imul(hash, 16777619); }
  return (hash >>> 0) / 4294967295;
}

export function rankCandidates(candidates: FeedCandidate[], now: Date, seed: string, recentAuthors: string[] = [], recentCategories: string[] = []): RankedCandidate[] {
  return candidates.map((candidate) => {
    const ageHours = Math.max(0, (now.getTime() - new Date(candidate.published_at).getTime()) / 3_600_000);
    const freshness = Math.exp(-ageHours / 168);
    const answerRate = (candidate.vote_count + 2) / (candidate.impression_count + 6);
    const upvoteRate = (candidate.upvote_count + 1) / (candidate.vote_count + 5);
    const followRate = (candidate.follow_count + 1) / (candidate.impression_count + 10);
    const reportRate = candidate.report_count / (candidate.impression_count + 10);
    const affinity = candidate.followed_category || candidate.followed_author ? 1 : 0;
    const exploration = seededExploration(candidate.question_id, seed);
    const authorPenalty = recentAuthors.filter((id) => id === candidate.author_id).length * 1.2;
    const categoryPenalty = recentCategories.filter((id) => id === candidate.category_id).length * 0.5;
    const score = affinity * 2.2 + freshness * 1.8 + answerRate * 1.2 + upvoteRate + followRate * 0.8 + exploration * 0.45 - reportRate * 4 - authorPenalty - categoryPenalty;
    const reasons = [affinity ? "affinité" : "découverte", freshness > 0.7 ? "récence" : "catalogue"];
    return { ...candidate, score, reasons };
  }).sort((a, b) => b.score - a.score || a.question_id.localeCompare(b.question_id));
}

export function diversify(candidates: RankedCandidate[], recentAuthors: string[] = [], recentCategories: string[] = []) {
  const remaining = [...candidates]; const output: RankedCandidate[] = [];
  while (remaining.length) {
    const lastAuthor = [...recentAuthors, ...output.map((item) => item.author_id)].at(-1);
    const categories = [...recentCategories, ...output.map((item) => item.category_id)];
    const lastTwoCategories = categories.slice(-2);
    let index = remaining.findIndex((item) => item.author_id !== lastAuthor && !(lastTwoCategories.length === 2 && lastTwoCategories.every((id) => id === item.category_id)));
    if (index < 0) index = 0;
    output.push(remaining.splice(index, 1)[0]);
  }
  return output;
}
