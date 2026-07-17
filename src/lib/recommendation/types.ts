export type SourcePool = "explicit" | "learned" | "neighbor" | "exploration" | "editorial" | "sponsored";
export type Sensitivity = "low" | "medium" | "high";
export type QuestionFormat = "opinion" | "projection" | "regulation" | "comportement" | "dilemme";
export type InteractionType = "answer" | "upvote" | "comment" | "category_follow" | "category_unfollow" | "fast_skip" | "hide" | "archive" | "report";

export type Candidate = {
  questionId: string;
  questionText: string;
  authorId: string;
  authorUsername: string;
  authorVerified: boolean;
  categoryId: string;
  categorySlug: string;
  categoryName: string;
  universeId: string;
  universeSlug: string;
  publishedAt: string;
  options: Array<{ id: string; text: string }>;
  tags: string[];
  sensitivity: Sensitivity;
  format: QuestionFormat;
  editorialType: string;
  publicationPriority: number;
  adminFeatured?: boolean;
  targetMinAge: number | null;
  targetMaxAge: number | null;
  isActive: boolean;
  moderationEligible: boolean;
  sponsorEligible: boolean;
  voteCount: number;
  upvoteCount: number;
  commentCount: number;
  reportCount: number;
  impressionCount: number;
  fastSkipCount: number;
  followedCategory: boolean;
  followedAuthor: boolean;
  initiallyFollowed: boolean;
  lastShownAt: string | null;
  sponsoredBy: string | null;
  sourcePool: SourcePool;
};

export type InteractionSignal = {
  type: InteractionType;
  occurredAt: string;
  categoryId: string | null;
  universeId: string | null;
  format: QuestionFormat | null;
  tags: string[];
};

export type AffinityProfile = {
  universes: Map<string, number>;
  categories: Map<string, number>;
  tags: Map<string, number>;
  formats: Map<string, number>;
  interactionCount: number;
};

export type ScoreComponents = {
  affinity: number;
  editorialQuality: number;
  performance: number;
  novelty: number;
  exploration: number;
  freshness: number;
  editorialPriority: number;
  reportPenalty: number;
  unansweredPenalty: number;
  recentImpressionPenalty: number;
};

export type ScoredCandidate = Candidate & {
  finalScore: number;
  scoreComponents: ScoreComponents;
};

export type SessionHistoryItem = Pick<Candidate, "questionId" | "categoryId" | "categorySlug" | "universeId" | "universeSlug" | "tags" | "sensitivity" | "format" | "sponsoredBy">;

export type RerankedCandidate = ScoredCandidate & {
  appliedConstraints: string[];
  relaxedConstraints: string[];
};

export type EligibilityContext = {
  votedQuestionIds: Set<string>;
  hiddenQuestionIds: Set<string>;
  archivedQuestionIds: Set<string>;
  reportedQuestionIds: Set<string>;
  blockedAuthorIds: Set<string>;
  sessionQuestionIds: Set<string>;
  age: number;
};

export type DebugTrace = {
  candidateCount: number;
  exclusions: Array<{ questionId: string; reasons: string[] }>;
  selected: Array<{ questionId: string; score: number; pool: SourcePool; relaxed: string[] }>;
};
