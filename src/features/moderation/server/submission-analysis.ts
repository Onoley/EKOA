import{moderateQuestion}from"./moderate-question";
export type SubmissionContentCheck={source:"question"|`option_${number}`;text:string;result:Awaited<ReturnType<typeof moderateQuestion>>};
export type SubmissionModerationAnalysis={action:"ALLOW"|"ALLOW_WITH_REWRITE"|"REVIEW"|"BLOCK_RECOMMENDED";priority:"normal"|"high"|"urgent";checks:SubmissionContentCheck[];lexicalSeverity:0|1|2|3;predictedSeverity:0|1|2|3;confidence:number;targetType:string;intent:string;suggestedRewrite:string|null;lexiconVersion:string;engineVersion:"moderation-v1"};
export async function analyzeSubmissionContent(text:string,options:string[]):Promise<SubmissionModerationAnalysis>{
 const results=await Promise.all([moderateQuestion(text),...options.map(option=>moderateQuestion(option))]);
 const checks:SubmissionContentCheck[]=results.map((result,index)=>({source:index===0?"question":`option_${index}` as const,text:index===0?text:options[index-1],result}));
 const rank={ALLOW:0,ALLOW_WITH_REWRITE:1,REVIEW:2,BLOCK_RECOMMENDED:3}as const;const strongest=results.reduce((current,result)=>rank[result.action]>rank[current.action]?result:current,results[0]);
 const predictedSeverity=Math.max(...results.map(result=>result.predictedSeverity))as 0|1|2|3;const lexicalSeverity=Math.max(...results.map(result=>result.lexicalSeverity))as 0|1|2|3;
 return{action:strongest.action,priority:strongest.action==="BLOCK_RECOMMENDED"||predictedSeverity===3?"urgent":predictedSeverity===2?"high":"normal",checks,lexicalSeverity,predictedSeverity,confidence:Math.max(...results.map(result=>result.confidence)),targetType:strongest.targetType,intent:strongest.intent,suggestedRewrite:results.find(result=>result.suggestedRewrite)?.suggestedRewrite??null,lexiconVersion:strongest.lexiconVersion,engineVersion:"moderation-v1"};
}
