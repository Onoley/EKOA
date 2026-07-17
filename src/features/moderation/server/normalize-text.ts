import type{ModerationLexicon,ExtendedModerationLexicon}from"../schema";

export type NormalizedModerationText={original:string;normalized:string;accentInsensitive:string;tokens:string[];obfuscations:string[]};
type LexiconLike=Pick<ModerationLexicon,"terms"|"expressions">|Pick<ExtendedModerationLexicon,"terms">;
const invisible=/[\u200B-\u200D\u2060\uFEFF]/gu;
const diacritics=/\p{M}/gu;
const tokenPattern=/[\p{L}\p{N}@$]+/gu;

export function withoutAccents(value:string){return value.normalize("NFD").replace(diacritics,"")}
function basic(value:string){return value.normalize("NFKC").replace(invisible,"").toLocaleLowerCase("fr").replace(/\s+/gu," ").trim()}
function joinDeliberatelySeparatedLetters(value:string,obfuscations:string[]){return value.replace(/(?<!\p{L})(?:[\p{L}][\s._-]+){2,}[\p{L}](?!\p{L})/gu,match=>{const joined=match.replace(/[\s._-]+/gu,"");obfuscations.push(match);return joined})}
function knownForms(lexicons:LexiconLike[]){const forms=new Set<string>();for(const lexicon of lexicons){for(const term of lexicon.terms)for(const form of[term.term,term.normalized_term,...term.variants])forms.add(withoutAccents(basic(form)));if("expressions"in lexicon)for(const expression of lexicon.expressions)for(const form of[expression.text,expression.normalized_text,...expression.variants])forms.add(withoutAccents(basic(form)))}return forms}
function substitutions(token:string){const choices:Record<string,string[]>={"0":["o"],"1":["i","l"],"3":["e"],"4":["a"],"5":["s"],"7":["t"],"@":["a"],"$":["s"]};let values=[""];for(const character of token){const replacements=choices[character]??[character];values=values.flatMap(prefix=>replacements.map(replacement=>prefix+replacement)).slice(0,32)}return values}
function normalizeToken(token:string,forms:Set<string>,obfuscations:string[]){const plain=withoutAccents(token);if(forms.has(plain))return token;const candidates=substitutions(plain);for(const candidate of candidates){if(forms.has(candidate)){obfuscations.push(token);return candidate}const collapsed=candidate.replace(/([a-z])\1{2,}/gu,"$1");if(forms.has(collapsed)){obfuscations.push(token);return collapsed}}return token}

export function normalizeText(text:string,lexicons:LexiconLike[]):NormalizedModerationText{
 const obfuscations:string[]=[];const joined=joinDeliberatelySeparatedLetters(basic(text),obfuscations);const forms=knownForms(lexicons);
 const normalized=joined.replace(tokenPattern,token=>normalizeToken(token,forms,obfuscations)).replace(/\s+/gu," ").trim();
 const accentInsensitive=withoutAccents(normalized);const tokens=accentInsensitive.match(tokenPattern)??[];
 return{original:text,normalized,accentInsensitive,tokens,obfuscations:[...new Set(obfuscations)]};
}
