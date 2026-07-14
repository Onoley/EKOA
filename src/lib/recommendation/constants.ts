export const RECOMMENDATION_CONFIG = {
  rankingVersion: "v1",
  experimentVariant: "control",
  maxCandidates: 300,
  reservationSize: 15,
  reservationTtlMinutes: 30,
  sessionTtlHours: 6,
  pageSize: 5,
  fastSkipThresholdMs: 1_500,
  interestDecayDays: 90,
  priorStrength: 50,
  affinityWeight: 30,
  editorialQualityWeight: 20,
  performanceWeight: 15,
  noveltyWeight: 10,
  explorationWeight: 10,
  freshnessWeight: 10,
  editorialPriorityWeight: 5,
  maxSameUniverseInWindow: 2,
  maxSensitiveInWindow: 2,
  diversityWindow: 5,
  sponsoredInterval: 8,
  politicalEarlyWindow: 4,
  affinityBounds: { min: -2, max: 3 },
  interactionWeights: {
    category_follow: { category: 1, universe: 0.2 },
    answer: { category: 0.05, tag: 0.02, format: 0.01 },
    upvote: { category: 0.2, tag: 0.1, format: 0.05 },
    comment: { category: 0.35, tag: 0.15, format: 0.08 },
    fast_skip: { category: -0.08, tag: -0.03 },
    hide: { category: -0.4, tag: -0.2 },
    archive: { category: -0.4, tag: -0.2 },
  },
} as const;

export const POLITICAL_CATEGORY_SLUGS = new Set([
  "politique-citoyennete",
  "monde-geopolitique",
]);

export const LIGHT_UNIVERSE_SLUGS = new Set([
  "culture-divertissement",
  "mode-vie-passions",
]);
