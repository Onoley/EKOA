import{z}from"zod";
export const moderationActions=z.enum(["no_action","limit_question","remove_question","restore_question","hide_comment","remove_comment","restore_comment"]);
export const moderationInputSchema=z.object({reportId:z.uuid(),action:moderationActions,reason:z.string().trim().min(5,"Précisez la justification.").max(500)});
export const suspensionSchema=z.object({userId:z.uuid(),suspended:z.boolean(),reason:z.string().trim().min(5).max(500)});
export const verificationSchema=z.object({userId:z.uuid(),status:z.enum(["pending","verified","rejected"]),organisationType:z.string().trim().min(2).max(80),organisationName:z.string().trim().min(2).max(120),publicDescription:z.string().trim().max(500),officialWebsite:z.union([z.url("URL invalide."),z.literal("")]),responsibleOwner:z.string().trim().max(200),privateNotes:z.string().trim().max(1000)});
export const forbiddenTermSchema=z.object({term:z.string().trim().min(2).max(80),severity:z.coerce.number().int().min(1).max(3),active:z.boolean()});
export const accountSearchSchema=z.string().trim().regex(/^[A-Za-z0-9_]{3,24}$/);
export const directQuestionActionSchema=z.object({questionId:z.uuid(),action:z.enum(["remove","restore","feature_24","feature_48","unfeature"]),reason:z.string().trim().min(5,"Précisez la justification.").max(500)});
export const quickVerificationSchema=z.object({userId:z.uuid(),verified:z.boolean()});

export const moderationSeveritySchema=z.number().int().min(0).max(3);
export const moderationActionSchema=z.enum(["ALLOW","ALLOW_WITH_REWRITE","CONTEXT_ONLY","REVIEW","BLOCK_RECOMMENDED"]);
export const moderationSourceSchema=z.object({id:z.string().min(1),name:z.string().min(1),url:z.string(),raw_url:z.string(),license:z.string().min(1),usage:z.string().min(1),citation:z.string().min(1).optional()});
export const moderationRiskCategorySchema=z.object({code:z.string().min(1),label:z.string().min(1),description:z.string().min(1),default_severity:moderationSeveritySchema});
const stringList=z.array(z.string());
const moderationSourceRecordSchema=z.object({id:z.string().min(1),category:z.string().min(1),level:z.string().min(1),stereotype:z.string().min(1),pos:z.string().min(1)});
export const moderationTermSchema=z.object({id:z.string().min(1).nullable(),slug:z.string().min(1),term:z.string().min(1),normalized_term:z.string().min(1),variants:stringList,risk_categories:stringList,source_categories:stringList,source_ids:stringList,source_records:z.array(moderationSourceRecordSchema),tier:z.enum(["core","extended"]),default_severity:moderationSeveritySchema,max_contextual_severity:moderationSeveritySchema,trigger_policy:z.enum(["always_review","contextual_review","rewrite_or_review","pattern_only","contextual_only","monitor_only"]),trigger_on_term_alone:z.boolean(),target_required:z.boolean(),context_dependency:z.enum(["ambiguous","dependent","highly_ambiguous","independent","mostly_independent"]),allowed_contexts:stringList,suspicious_contexts:stringList,replacement_suggestions:stringList,dangerous_patterns:stringList,recommended_action:moderationActionSchema,confidence:z.enum(["curated","high","medium","low"]),needs_human_validation:z.boolean(),notes:z.string(),active:z.boolean(),version:z.string().min(1)});
export const moderationExpressionSchema=z.object({id:z.string().min(1),text:z.string().min(1),normalized_text:z.string().min(1),risk_categories:stringList,severity:moderationSeveritySchema,recommended_action:moderationActionSchema,target_type:z.string().min(1),priority:z.enum(["normal","high","urgent"]),variants:stringList,notes:z.string(),source_ids:stringList,active:z.boolean(),version:z.string().min(1)});
export const moderationPatternSchema=z.object({id:z.string().min(1),slug:z.string().min(1),regex:z.string().min(1),applies_to:z.enum(["normalized_text","original_text"]),flags:stringList,risk_categories:stringList,severity:moderationSeveritySchema,recommended_action:moderationActionSchema,description:z.string().min(1),target_type:z.string().min(1),priority:z.enum(["normal","high","urgent"]),examples:stringList,source_ids:stringList,active:z.boolean(),version:z.string().min(1)});
export const moderationTestCaseSchema=z.object({id:z.string().min(1),text:z.string().min(1),expected_action:moderationActionSchema,expected_severity:moderationSeveritySchema,expected_target_type:z.string().min(1),notes:z.string()});
export const moderationStatisticsSchema=z.object({canonical_terms:z.number().int().nonnegative(),core_terms:z.number().int().nonnegative(),extended_terms:z.number().int().nonnegative(),variants:z.number().int().nonnegative(),expressions:z.number().int().nonnegative(),patterns:z.number().int().nonnegative(),test_cases:z.number().int().nonnegative(),risk_categories:z.number().int().nonnegative(),regex_errors:z.number().int().nonnegative()});
const moderationMetadataSchema=z.object({schema_version:z.string().min(1),lexicon_version:z.string().min(1),language:z.literal("fr")});
const moderationLexiconBaseSchema=moderationMetadataSchema.extend({sources:z.array(moderationSourceSchema).min(1),terms:z.array(moderationTermSchema)});

function addLexiconConsistencyChecks(data:{sources:Array<{id:string}>;terms:Array<z.infer<typeof moderationTermSchema>>;expressions?:Array<z.infer<typeof moderationExpressionSchema>>;patterns?:Array<z.infer<typeof moderationPatternSchema>>;test_cases?:Array<z.infer<typeof moderationTestCaseSchema>>},ctx:z.RefinementCtx){
 const seen=new Set<string>();const sourceIds=new Set(data.sources.map(source=>source.id));
 const register=(id:string,path:(string|number)[])=>{if(seen.has(id))ctx.addIssue({code:"custom",message:`Identifiant dupliqué : ${id}`,path});else seen.add(id)};
 data.sources.forEach((source,index)=>register(`source:${source.id}`,["sources",index,"id"]));
 data.terms.forEach((term,index)=>{register(`term:${term.id??term.slug}`,["terms",index,"id"]);register(`slug:${term.slug}`,["terms",index,"slug"]);if(new Set(term.variants).size!==term.variants.length)ctx.addIssue({code:"custom",message:"Variantes dupliquées dans l’entrée.",path:["terms",index,"variants"]});term.source_ids.forEach(sourceId=>{if(!sourceIds.has(sourceId))ctx.addIssue({code:"custom",message:`Source inconnue : ${sourceId}`,path:["terms",index,"source_ids"]})})});
 data.expressions?.forEach((entry,index)=>{register(`expression:${entry.id}`,["expressions",index,"id"]);if(new Set(entry.variants).size!==entry.variants.length)ctx.addIssue({code:"custom",message:"Variantes dupliquées dans l’expression.",path:["expressions",index,"variants"]});entry.source_ids.forEach(sourceId=>{if(!sourceIds.has(sourceId))ctx.addIssue({code:"custom",message:`Source inconnue : ${sourceId}`,path:["expressions",index,"source_ids"]})})});
 data.patterns?.forEach((entry,index)=>{register(`pattern:${entry.id}`,["patterns",index,"id"]);entry.source_ids.forEach(sourceId=>{if(!sourceIds.has(sourceId))ctx.addIssue({code:"custom",message:`Source inconnue : ${sourceId}`,path:["patterns",index,"source_ids"]})});try{new RegExp(entry.regex,entry.flags.join(""))}catch{ctx.addIssue({code:"custom",message:"Expression régulière invalide.",path:["patterns",index,"regex"]})}});
 data.test_cases?.forEach((entry,index)=>register(`test:${entry.id}`,["test_cases",index,"id"]));
}

export const moderationLexiconSchema=moderationLexiconBaseSchema.extend({generated_at:z.iso.datetime({offset:true}),project:z.literal("Ekoa"),purpose:z.string().min(1),critical_rules:stringList,severity_levels:z.record(z.string(),z.string()),trigger_policies:z.record(z.string(),z.string()),recommended_actions:z.record(z.string(),z.string()),normalization:z.object({unicode:z.string().min(1),lowercase:z.boolean(),remove_invisible_characters:z.boolean(),collapse_whitespace:z.boolean(),accent_insensitive_comparison:z.boolean(),leet_substitutions:z.record(z.string(),z.string()),warning:z.string().min(1)}),statistics:moderationStatisticsSchema,category_counts:z.record(z.string(),z.number().int().nonnegative()),risk_categories:z.array(moderationRiskCategorySchema),expressions:z.array(moderationExpressionSchema),patterns:z.array(moderationPatternSchema),test_cases:z.array(moderationTestCaseSchema)}).superRefine(addLexiconConsistencyChecks);
export const extendedModerationLexiconSchema=moderationLexiconBaseSchema.extend({usage:z.string().min(1)}).superRefine((data,ctx)=>{addLexiconConsistencyChecks(data,ctx);data.terms.forEach((term,index)=>{if(term.tier!=="extended"||term.trigger_on_term_alone||term.trigger_policy!=="monitor_only"||term.recommended_action!=="CONTEXT_ONLY")ctx.addIssue({code:"custom",message:"Un terme extended ne peut ni bloquer ni déclencher seul une review.",path:["terms",index]})})});
export type ModerationLexicon=z.infer<typeof moderationLexiconSchema>;
export type ExtendedModerationLexicon=z.infer<typeof extendedModerationLexiconSchema>;

export type ModerationSeverity=0|1|2|3;
export type ModerationDecision="ALLOW"|"ALLOW_WITH_REWRITE"|"REVIEW"|"BLOCK_RECOMMENDED";
export type ModerationTargetType="none"|"animal"|"object"|"waste"|"person"|"public_figure"|"username"|"group"|"protected_group"|"unknown";
export type ModerationIntent="neutral_question"|"informal_question"|"targeted_insult"|"harassment"|"hate_or_discrimination"|"threat"|"incitement_to_violence"|"self_harm_encouragement"|"dangerous_instruction"|"sexual_content"|"sexual_content_involving_minors"|"doxxing"|"terrorism_or_extremism"|"unknown";
export type DetectedTerm={termId:string;canonicalTerm:string;matchedText:string;normalizedMatch:string;tier:"core"|"extended";start:number;end:number;defaultSeverity:ModerationSeverity;maxContextualSeverity:ModerationSeverity;riskCategories:string[];triggerPolicy:string;contextWindow:string;sourceIds:string[];allowedContexts:string[];suspiciousContexts:string[];replacementSuggestions:string[];contextDependency:string;recommendedAction:z.infer<typeof moderationActionSchema>};
export type DetectedExpression={expressionId:string;canonicalText:string;matchedText:string;start:number;end:number;severity:ModerationSeverity;riskCategories:string[];recommendedAction:z.infer<typeof moderationActionSchema>;targetType:string};
export type DetectedPattern={patternId:string;slug:string;matchedText:string;capturedGroups:string[];start:number;end:number;severity:ModerationSeverity;riskCategories:string[];recommendedAction:z.infer<typeof moderationActionSchema>;targetType:string;priority:"normal"|"high"|"urgent"};
export type ModerationResult={action:ModerationDecision;lexicalSeverity:ModerationSeverity;predictedSeverity:ModerationSeverity;confidence:number;targetType:ModerationTargetType;intent:ModerationIntent;detectedTerms:DetectedTerm[];detectedExpressions:DetectedExpression[];detectedPatterns:DetectedPattern[];detectedObfuscations:string[];reasonCodes:string[];contextCodes:string[];suggestedRewrite:string|null;lexiconVersion:string;engineVersion:"moderation-v1"};

export const automatedAdminDecisionSchema=z.object({
 questionId:z.uuid(),
 decision:z.enum(["approve_as_is","false_positive","approve_suggested_rewrite","approve_manual_edit","request_rewrite","reject"]),
 reason:z.string().trim().max(500),
 warningLevel:z.coerce.number().int().min(0).max(3),
 text:z.string().trim().max(180).optional(),
 options:z.array(z.string().trim().min(1).max(80)).max(6),
}).superRefine((value,ctx)=>{
 if(["request_rewrite","reject"].includes(value.decision)&&value.reason.length<5)ctx.addIssue({code:"custom",path:["reason"],message:"Précisez la raison de la décision."});
 if(value.decision==="request_rewrite"&&![0,1].includes(value.warningLevel))ctx.addIssue({code:"custom",path:["warningLevel"],message:"Cette demande accepte uniquement un avertissement de niveau 1."});
 if(!["request_rewrite","reject"].includes(value.decision)&&value.warningLevel!==0)ctx.addIssue({code:"custom",path:["warningLevel"],message:"Cette décision ne crée pas d’avertissement."});
 if(value.decision==="approve_manual_edit"){
  if(!value.text||value.text.length<10)ctx.addIssue({code:"custom",path:["text"],message:"La question doit contenir au moins 10 caractères."});
  if(value.options.length<2)ctx.addIssue({code:"custom",path:["options"],message:"Ajoutez au moins deux réponses."});
 }
});

export const questionRevisionSchema=z.object({
 questionId:z.uuid(),
 text:z.string().trim().min(10,"La question doit contenir au moins 10 caractères.").max(180),
 options:z.array(z.string().trim().min(1).max(80)).min(2).max(6),
}).refine(value=>new Set(value.options.map(option=>option.toLocaleLowerCase("fr").trim())).size===value.options.length,{path:["options"],message:"Chaque réponse doit être différente."});

export type AutomatedModerationQueueItem={
 queue_id:string;question_id:string;moderation_check_id:string;user_id:string;username:string;
 question_text:string;options:Array<{position:number;text:string}>;submitted_at:string;
 queue_status:"pending"|"in_review"|"revision_required";priority:"normal"|"high"|"urgent";
 estimated_severity:number;action_recommended:ModerationDecision;target_type:string;intent:string;
 core_terms:Array<{term:string;source:string}>;expressions:Array<{expression:string;source:string}>;
 patterns:Array<{pattern:string;source:string}>;signal_sources:string[];reason_codes:string[];
 suggested_rewrite:string|null;original_text:string;original_options:Array<string>|Array<{position:number;text:string}>;
};

export type AutomatedModerationHistoryItem={
 decision_id:string;question_id:string;admin_id:string;admin_username:string;author_username:string;
 decision:"approve_as_is"|"false_positive"|"approve_suggested_rewrite"|"approve_manual_edit"|"request_rewrite"|"reject";
 warning_level:number;admin_reason:string;previous_text:string;final_text:string;
 previous_options:string[];final_options:string[];created_at:string;
};

export type MyModeratedQuestion={
 question_id:string;question_text:string;options:Array<{position:number;text:string}>;question_status:string;
 automated_moderation_status:"not_required"|"pending_admin_review"|"revision_required"|"approved"|"rejected";
 submitted_at:string;suggested_rewrite:string|null;queue_status:string|null;admin_reason:string|null;warning_level:number;
};
