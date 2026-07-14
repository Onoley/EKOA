import type { Candidate, EligibilityContext } from "./types";

export function eligibilityReasons(candidate: Candidate, context: EligibilityContext) {
  const reasons: string[] = [];
  if (!candidate.isActive) reasons.push("inactive");
  if (!candidate.moderationEligible) reasons.push("moderated");
  if (!candidate.sponsorEligible) reasons.push("inactive_sponsor");
  if (candidate.targetMinAge !== null && context.age < candidate.targetMinAge) reasons.push("age_restricted");
  if (candidate.targetMaxAge !== null && context.age > candidate.targetMaxAge) reasons.push("age_restricted");
  if (context.votedQuestionIds.has(candidate.questionId)) reasons.push("already_voted");
  if (context.hiddenQuestionIds.has(candidate.questionId)) reasons.push("hidden");
  if (context.archivedQuestionIds.has(candidate.questionId)) reasons.push("archived");
  if (context.reportedQuestionIds.has(candidate.questionId)) reasons.push("reported");
  if (context.blockedAuthorIds.has(candidate.authorId)) reasons.push("blocked_author");
  if (context.sessionQuestionIds.has(candidate.questionId)) reasons.push("already_in_session");
  return reasons;
}

export function filterEligibleCandidates(candidates: Candidate[], context: EligibilityContext) {
  const exclusions: Array<{ questionId: string; reasons: string[] }> = [];
  const eligible = candidates.filter((candidate) => {
    const reasons = eligibilityReasons(candidate, context);
    if (reasons.length) exclusions.push({ questionId: candidate.questionId, reasons });
    return reasons.length === 0;
  });
  return { eligible, exclusions };
}
