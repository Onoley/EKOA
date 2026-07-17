import type{DetectedExpression,DetectedPattern,DetectedTerm,ModerationSeverity}from"../schema";
import type{ContextAnalysis}from"./context-analyzer";

function severity(value:number):ModerationSeverity{return Math.max(0,Math.min(3,Math.round(value)))as ModerationSeverity}
export function evaluateSeverity(terms:DetectedTerm[],expressions:DetectedExpression[],patterns:DetectedPattern[],context:ContextAnalysis){
 const lexicalSeverity=severity(Math.max(0,...terms.map(term=>term.defaultSeverity),...expressions.map(item=>item.severity),...patterns.map(item=>item.severity)));
 let predictedSeverity:ModerationSeverity=lexicalSeverity;
 if(context.dangerous)predictedSeverity=3;
 else if(context.legitimate)predictedSeverity=terms.some(term=>term.recommendedAction==="ALLOW_WITH_REWRITE")?1:0;
 else if(context.humanTarget&&(terms.some(term=>term.maxContextualSeverity>=2)||expressions.some(item=>item.severity>=2)||patterns.some(item=>item.severity>=2)))predictedSeverity=2;
 else if(context.codes.includes("POSSIBLE_GLORIFICATION"))predictedSeverity=Math.max(1,predictedSeverity)as ModerationSeverity;
 return{lexicalSeverity,predictedSeverity};
}
