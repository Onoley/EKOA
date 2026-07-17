import type{DetectedExpression,DetectedPattern,DetectedTerm,ModerationTargetType}from"../schema";
import type{NormalizedModerationText}from"./normalize-text";

const protectedGroups=["musulman","musulmans","juif","juifs","chrétien","chrétiens","noir","noirs","arabe","arabes","asiatique","asiatiques","rom","roms","gay","gays","lesbienne","lesbiennes","trans","immigré","immigrés","étranger","étrangers"];
const animalWords=["animal","animaux","chien","chiens","chienne","chiennes","chat","chats","vétérinaire","croquettes","laisse","promenade","race canine"];
const wasteWords=["déchet","déchets","ordure","ordures","poubelle","poubelles","ramassage","recyclage","tri sélectif"];
const personWords=["femme","homme","personne","individu","tu","vous","cette fille","ce garçon"];
const groupWords=["ces personnes","ces gens","ils sont","elles sont","vous êtes","groupe","communauté"];
function escapeRegex(value:string){return value.replace(/[.*+?^${}()|[\]\\]/gu,"\\$&")}
function containsAny(text:string,values:string[]){return values.some(value=>new RegExp(`(^|[^\\p{L}])${escapeRegex(value)}(?=$|[^\\p{L}])`,"u").test(text))}

export function detectTarget(text:NormalizedModerationText,terms:DetectedTerm[],expressions:DetectedExpression[],patterns:DetectedPattern[]):ModerationTargetType{
 const value=text.normalized;
 if(/@[\p{L}\p{N}_]{2,}/u.test(value))return"username";
 if(/\b(président|présidente|ministre|député|députée|maire)\s+[\p{Lu}\p{Ll}]/u.test(text.original))return"public_figure";
 const human=containsAny(value,personWords)||containsAny(value,groupWords);
 if(containsAny(value,protectedGroups)||expressions.some(item=>item.targetType==="protected_group")||patterns.some(item=>item.targetType==="protected_group"))return"protected_group";
 if(containsAny(value,animalWords)&&!human)return"animal";
 if(containsAny(value,wasteWords)&&!human)return"waste";
 if(containsAny(value,groupWords)||expressions.some(item=>item.targetType==="group")||patterns.some(item=>item.targetType==="group"))return"group";
 if(containsAny(value,personWords)||expressions.some(item=>item.targetType==="person")||patterns.some(item=>item.targetType==="person"))return"person";
 if(/\b(objet|voiture|maison|téléphone|ordinateur)\b/u.test(value))return"object";
 if(!terms.length&&!expressions.length&&!patterns.length)return"none";
 return"unknown";
}
