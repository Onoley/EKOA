import { LIGHT_UNIVERSE_SLUGS, POLITICAL_CATEGORY_SLUGS, RECOMMENDATION_CONFIG } from "./constants";
import type { RerankedCandidate, ScoredCandidate, SessionHistoryItem } from "./types";

type Constraint = "same_category" | "universe_window" | "minimum_universes" | "sensitive_window" | "same_format" | "same_tag" | "political_early" | "sponsored_early" | "sponsored_interval" | "sponsored_consecutive" | "discovery_slot";
const RELAXATION_ORDER: Constraint[] = ["same_tag", "same_format", "universe_window", "sensitive_window", "political_early", "discovery_slot", "minimum_universes", "same_category", "sponsored_interval", "sponsored_early"];

function violations(candidate: ScoredCandidate, sequence: SessionHistoryItem[], position: number): Constraint[] {
  const result: Constraint[] = [];
  const last = sequence.at(-1);
  const window = sequence.slice(-(RECOMMENDATION_CONFIG.diversityWindow - 1));
  if (last?.categoryId === candidate.categoryId) result.push("same_category");
  if (window.filter((item) => item.universeId === candidate.universeId).length >= RECOMMENDATION_CONFIG.maxSameUniverseInWindow) result.push("universe_window");
  if (position>=7&&position<10&&new Set(sequence.slice(0,10).map((item)=>item.universeId)).size<3&&sequence.some((item)=>item.universeId===candidate.universeId)) result.push("minimum_universes");
  if (candidate.sensitivity === "high" && window.filter((item) => item.sensitivity === "high").length >= RECOMMENDATION_CONFIG.maxSensitiveInWindow) result.push("sensitive_window");
  if (sequence.slice(-2).every((item) => item.format === candidate.format) && sequence.length >= 2) result.push("same_format");
  if (last && candidate.tags.some((tag) => last.tags.includes(tag))) result.push("same_tag");
  if (position < RECOMMENDATION_CONFIG.politicalEarlyWindow && POLITICAL_CATEGORY_SLUGS.has(candidate.categorySlug) && sequence.some((item) => POLITICAL_CATEGORY_SLUGS.has(item.categorySlug))) result.push("political_early");
  if (candidate.sponsoredBy && position < 3) result.push("sponsored_early");
  if (candidate.sponsoredBy && last?.sponsoredBy) result.push("sponsored_consecutive");
  if (candidate.sponsoredBy && sequence.slice(-(RECOMMENDATION_CONFIG.sponsoredInterval - 1)).some((item) => item.sponsoredBy)) result.push("sponsored_interval");
  if ((position + 1) % 6 === 0 && candidate.sourcePool !== "exploration" && !LIGHT_UNIVERSE_SLUGS.has(candidate.universeSlug)) result.push("discovery_slot");
  return result;
}

export function rerankWithSessionConstraints(candidates: ScoredCandidate[], history: SessionHistoryItem[], limit: number): RerankedCandidate[] {
  const remaining = [...candidates];
  const output: RerankedCandidate[] = [];
  while (remaining.length && output.length < limit) {
    const sequence: SessionHistoryItem[] = [...history, ...output];
    const position = sequence.length;
    let allowedRelaxations = new Set<Constraint>();
    let selectedIndex = -1;
    let selectedViolations: Constraint[] = [];
    for (let relaxationCount = 0; relaxationCount <= RELAXATION_ORDER.length; relaxationCount++) {
      selectedIndex = remaining.findIndex((candidate) => {
        const current = violations(candidate, sequence, position);
        const hard = current.includes("sponsored_consecutive");
        if (!hard && current.every((item) => allowedRelaxations.has(item))) { selectedViolations = current; return true; }
        return false;
      });
      if (selectedIndex >= 0) break;
      const next = RELAXATION_ORDER[relaxationCount];
      if (next) allowedRelaxations = new Set([...allowedRelaxations, next]);
    }
    if (selectedIndex < 0) break;
    const selected = remaining.splice(selectedIndex, 1)[0];
    output.push({ ...selected, appliedConstraints: ["category_diversity", "universe_window", "sensitivity_window", "format_diversity", "tag_diversity", "sponsor_spacing"], relaxedConstraints: selectedViolations });
  }
  return output;
}

export const SESSION_RELAXATION_ORDER = [...RELAXATION_ORDER];
