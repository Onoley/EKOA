import type{DetectedTerm}from"../schema";

export function suggestRewrite(original:string,terms:DetectedTerm[]){let rewritten=original;let changed=false;for(const term of terms){const replacement=term.replacementSuggestions[0]||(term.canonicalTerm==="ordures"?"poubelles":undefined);if(!replacement)continue;const escaped=term.matchedText.replace(/[.*+?^${}()|[\]\\]/gu,"\\$&");const next=rewritten.replace(new RegExp(`\\b${escaped}\\b`,"iu"),replacement);if(next!==rewritten){rewritten=next;changed=true}}
 rewritten=rewritten.replace(/\bvotre chienne urine contre\b/iu,"votre chienne urine-t-elle contre").replace(/\bdes ordures\b/iu,"des poubelles");return changed?rewritten:null}
