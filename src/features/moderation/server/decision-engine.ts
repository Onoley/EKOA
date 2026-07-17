import type{DetectedExpression,DetectedPattern,DetectedTerm,ModerationDecision,ModerationSeverity}from"../schema";
import type{ContextAnalysis}from"./context-analyzer";

export function decideModeration(terms:DetectedTerm[],expressions:DetectedExpression[],patterns:DetectedPattern[],predictedSeverity:ModerationSeverity,context:ContextAnalysis,suggestedRewrite:string|null):{action:ModerationDecision;reasonCodes:string[]}{
 const reasons:string[]=[];const reliable=[...expressions,...patterns];if(reliable.some(item=>item.severity===3)||context.dangerous||predictedSeverity===3){reasons.push("DANGEROUS_LEVEL_3_SIGNAL");return{action:"BLOCK_RECOMMENDED",reasonCodes:reasons}}
 if(reliable.some(item=>item.severity===2)||predictedSeverity===2){reasons.push("CONTEXTUAL_LEVEL_2_SIGNAL");return{action:"REVIEW",reasonCodes:reasons}}
 const core=terms.filter(term=>term.tier==="core");if(core.length){reasons.push("CORE_TERM_DETECTED");if(suggestedRewrite)reasons.push("REWRITE_AVAILABLE");return{action:"REVIEW",reasonCodes:reasons}}
 if(terms.some(term=>term.tier==="extended")){reasons.push("EXTENDED_MONITORING_ONLY");return{action:"ALLOW",reasonCodes:reasons}}
 reasons.push("NO_MODERATION_SIGNAL");return{action:"ALLOW",reasonCodes:reasons};
}
