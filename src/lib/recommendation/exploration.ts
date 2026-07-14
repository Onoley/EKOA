import type { ScoredCandidate } from "./types";

function seededValue(seed: string, id: string) {
  let hash = 2166136261;
  for (const char of `${seed}:${id}`) { hash ^= char.charCodeAt(0); hash = Math.imul(hash, 16777619); }
  return (hash >>> 0) / 4_294_967_295;
}

export function applyDeterministicExploration(candidates: ScoredCandidate[], seed: string) {
  return candidates.map((candidate) => {
    const exploration = candidate.sourcePool === "exploration" ? seededValue(seed, candidate.questionId) * 2 : seededValue(seed, candidate.questionId) * 0.25;
    return { ...candidate, finalScore: Math.round(Math.min(100, candidate.finalScore + exploration) * 100) / 100 };
  }).sort((a, b) => b.finalScore - a.finalScore || a.questionId.localeCompare(b.questionId));
}
