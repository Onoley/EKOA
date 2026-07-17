import type{ModerationResult}from"../schema";
import{loadCoreModerationLexicon,loadExtendedModerationLexicon}from"./lexicon-loader";
import{normalizeText}from"./normalize-text";
import{detectLexicalTerms}from"./lexical-detector";
import{detectExpressions}from"./expression-detector";
import{detectPatterns}from"./pattern-detector";
import{detectTarget}from"./target-detector";
import{analyzeContext}from"./context-analyzer";
import{evaluateSeverity}from"./severity-evaluator";
import{suggestRewrite}from"./rewrite-suggester";
import{decideModeration}from"./decision-engine";

function confidence(input:{textLength:number;termCount:number;expressionCount:number;patternCount:number;targetKnown:boolean;obfuscationCount:number;adjustment:number}){let value=.45;value+=Math.min(.18,input.expressionCount*.12);value+=Math.min(.18,input.patternCount*.1);value+=Math.min(.12,input.termCount*.04);if(input.targetKnown)value+=.08;if(input.textLength<12)value-=.12;value-=Math.min(.16,input.obfuscationCount*.04);value+=input.adjustment;return Math.round(Math.max(0,Math.min(1,value))*100)/100}

export async function moderateQuestion(text:string):Promise<ModerationResult>{
 const[core,extended]=await Promise.all([loadCoreModerationLexicon(),loadExtendedModerationLexicon()]);
 const normalized=normalizeText(text,[core,extended]);
 const detectedTerms=detectLexicalTerms(normalized,core,extended);
 const detectedExpressions=detectExpressions(normalized,core);
 const detectedPatterns=detectPatterns(normalized,core);
 const targetType=detectTarget(normalized,detectedTerms,detectedExpressions,detectedPatterns);
 const context=analyzeContext(normalized,detectedTerms,detectedExpressions,detectedPatterns,targetType);
 const{lexicalSeverity,predictedSeverity}=evaluateSeverity(detectedTerms,detectedExpressions,detectedPatterns,context);
 const suggestedRewrite=suggestRewrite(text,detectedTerms);
 const decision=decideModeration(detectedTerms,detectedExpressions,detectedPatterns,predictedSeverity,context,suggestedRewrite);
 return{action:decision.action,lexicalSeverity,predictedSeverity,confidence:confidence({textLength:text.length,termCount:detectedTerms.length,expressionCount:detectedExpressions.length,patternCount:detectedPatterns.length,targetKnown:targetType!=="unknown"&&targetType!=="none",obfuscationCount:normalized.obfuscations.length,adjustment:context.confidenceAdjustment}),targetType,intent:context.intent,detectedTerms,detectedExpressions,detectedPatterns,detectedObfuscations:normalized.obfuscations,reasonCodes:decision.reasonCodes,contextCodes:context.codes,suggestedRewrite,lexiconVersion:core.lexicon_version,engineVersion:"moderation-v1"};
}
