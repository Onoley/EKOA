import type{DetectedExpression,DetectedPattern,DetectedTerm,ModerationIntent,ModerationTargetType}from"../schema";
import type{NormalizedModerationText}from"./normalize-text";

export type ContextAnalysis={codes:string[];intent:ModerationIntent;legitimate:boolean;dangerous:boolean;humanTarget:boolean;confidenceAdjustment:number};
const preventive=["prévention","prévenir","lutter contre","combattre","protéger","sensibiliser","réduire","éviter","renforcer la sécurité","mieux lutter"];
const informative=["histoire","historique","définition","signifie","information","informer","analyse","citation","médical","médecin","traitement","recherche"];
const condemnation=["condamner","condamnation","inadmissible","contre la haine","contre le terrorisme","dénoncer"];
const negations=["ne pas","n'est pas","jamais","aucun","sans"];
function hasAny(text:string,values:string[]){return values.some(value=>text.includes(value))}
function risks(items:Array<{riskCategories:string[]}>){return new Set(items.flatMap(item=>item.riskCategories))}

export function analyzeContext(text:NormalizedModerationText,terms:DetectedTerm[],expressions:DetectedExpression[],patterns:DetectedPattern[],targetType:ModerationTargetType):ContextAnalysis{
 const value=text.normalized;const codes:string[]=[];const allRisks=risks([...terms,...expressions,...patterns]);const humanTarget=["person","public_figure","username","group","protected_group"].includes(targetType);
 const isPreventive=hasAny(value,preventive);const isInformative=hasAny(value,informative);const isCondemnation=hasAny(value,condemnation);const isMedical=/\b(suicide|maladie|santé|symptôme|diagnostic|traitement|médecin)\b/u.test(value)&&(isPreventive||isInformative);const isAnimal=targetType==="animal";const isWaste=targetType==="waste";const hasNegation=hasAny(value,negations);
 if(isPreventive)codes.push("PREVENTIVE_CONTEXT");if(isInformative)codes.push("INFORMATIVE_CONTEXT");if(isCondemnation)codes.push("CONDEMNATION_CONTEXT");if(isMedical)codes.push("MEDICAL_CONTEXT");if(isAnimal)codes.push("ANIMAL_CONTEXT");if(isWaste)codes.push("WASTE_CONTEXT");if(hasNegation)codes.push("NEGATION_PRESENT");if(humanTarget)codes.push("HUMAN_TARGET");
 const severeSignal=[...expressions,...patterns].some(item=>item.severity===3);const ambiguousGlorification=/\b(attentat|terrorisme|terroriste)\b.*\b(bonne chose|bien|génial|justifié|soutenir)\b/u.test(value);if(ambiguousGlorification)codes.push("POSSIBLE_GLORIFICATION");
 let intent:ModerationIntent="neutral_question";
 if(allRisks.has("self_harm_encouragement")||/\bva te suicider\b/u.test(value))intent="self_harm_encouragement";
 else if(allRisks.has("doxxing")||/\b(voici|publie[rz]?)\s+(son|leur)\s+(adresse|numéro|telephone|téléphone)\b/u.test(value))intent="doxxing";
 else if(allRisks.has("sexual_minors"))intent="sexual_content_involving_minors";
 else if(allRisks.has("crime_instruction"))intent="dangerous_instruction";
 else if(allRisks.has("threat"))intent="threat";
 else if(allRisks.has("violence")&&severeSignal)intent="incitement_to_violence";
 else if(allRisks.has("terrorism_extremism")&&!isPreventive&&!isCondemnation)intent="terrorism_or_extremism";
 else if(allRisks.has("sexual_language")||allRisks.has("sexual_harassment"))intent="sexual_content";
 else if(humanTarget&&(allRisks.has("racism")||allRisks.has("xenophobia")||allRisks.has("homophobia")||allRisks.has("antisemitism")||allRisks.has("misogyny")))intent="hate_or_discrimination";
 else if(humanTarget&&(patterns.length>0||terms.some(term=>term.defaultSeverity>=2)))intent="targeted_insult";
 else if(terms.some(term=>term.defaultSeverity===1))intent="informal_question";
 const legitimate=(isPreventive||isInformative||isCondemnation||isMedical||isAnimal||isWaste)&&!severeSignal&&!ambiguousGlorification;
 const dangerous=severeSignal||["self_harm_encouragement","doxxing","sexual_content_involving_minors","dangerous_instruction","threat","incitement_to_violence"].includes(intent);
 return{codes,intent,legitimate,dangerous,humanTarget,confidenceAdjustment:(dangerous||legitimate)?0.15:targetType==="unknown"?-0.15:0};
}
