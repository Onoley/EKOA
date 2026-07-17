import { describe,expect,it } from "vitest";
import { filterEligibleCandidates } from "./eligibility";
import { computeQuestionScore,smoothedRate } from "./question-score";
import { rerankWithSessionConstraints } from "./session-reranker";
import { computeUserAffinity,decayWeight } from "./user-affinity";
import type { AffinityProfile,Candidate,InteractionSignal } from "./types";

let counter=0;
const candidate=(overrides:Partial<Candidate>={}):Candidate=>{counter+=1;return{questionId:`q-${counter}`,questionText:"Question ?",authorId:`a-${counter}`,authorUsername:"ekoa",authorVerified:true,categoryId:`c-${counter}`,categorySlug:`categorie-${counter}`,categoryName:"Catégorie",universeId:`u-${counter}`,universeSlug:`univers-${counter}`,publishedAt:"2026-07-01T00:00:00.000Z",options:[{id:`o-${counter}-1`,text:"Oui"},{id:`o-${counter}-2`,text:"Non"}],tags:[`tag-${counter}`],sensitivity:"low",format:"opinion",editorialType:"evergreen",publicationPriority:50,targetMinAge:null,targetMaxAge:null,isActive:true,moderationEligible:true,sponsorEligible:true,voteCount:100,upvoteCount:20,commentCount:5,reportCount:0,impressionCount:200,fastSkipCount:20,followedCategory:false,followedAuthor:false,initiallyFollowed:false,lastShownAt:null,sponsoredBy:null,sourcePool:"editorial",...overrides}};
const context=()=>({votedQuestionIds:new Set<string>(),hiddenQuestionIds:new Set<string>(),archivedQuestionIds:new Set<string>(),reportedQuestionIds:new Set<string>(),blockedAuthorIds:new Set<string>(),sessionQuestionIds:new Set<string>(),age:30});
const emptyAffinity:AffinityProfile={universes:new Map(),categories:new Map(),tags:new Map(),formats:new Map(),interactionCount:0};

describe("éligibilité recommandation",()=>{
  it.each([
    ["already_voted","votedQuestionIds"],["hidden","hiddenQuestionIds"],["archived","archivedQuestionIds"],["reported","reportedQuestionIds"],["already_in_session","sessionQuestionIds"],
  ] as const)("exclut %s",(reason,key)=>{const item=candidate();const input=context();input[key].add(item.questionId);expect(filterEligibleCandidates([item],input).exclusions[0].reasons).toContain(reason)});
  it("exclut un auteur bloqué",()=>{const item=candidate();const input=context();input.blockedAuthorIds.add(item.authorId);expect(filterEligibleCandidates([item],input).eligible).toHaveLength(0)});
  it("exclut statut, modération, âge et sponsor inactif",()=>{const items=[candidate({isActive:false}),candidate({moderationEligible:false}),candidate({targetMinAge:40}),candidate({sponsorEligible:false})];expect(filterEligibleCandidates(items,context()).eligible).toHaveLength(0)});
});

describe("affinité utilisateur",()=>{
  const now=new Date("2026-07-14T00:00:00Z");
  const signal=(type:InteractionSignal["type"],categoryId="cat"):InteractionSignal=>({type,occurredAt:now.toISOString(),categoryId,universeId:"uni",format:"opinion",tags:["tag"]});
  it("bonifie fortement une catégorie suivie",()=>expect(computeUserAffinity([], [{categoryId:"cat",universeId:"uni"}],now).categories.get("cat")).toBe(1));
  it("un commentaire pèse plus qu’un upvote, lui-même plus qu’un vote",()=>{const profile=computeUserAffinity([signal("answer","vote"),signal("upvote","upvote"),signal("comment","comment")],[],now);expect(profile.categories.get("comment")!).toBeGreaterThan(profile.categories.get("upvote")!);expect(profile.categories.get("upvote")!).toBeGreaterThan(profile.categories.get("vote")!)});
  it("pénalise légèrement un passage rapide et fortement un masquage",()=>{const profile=computeUserAffinity([signal("fast_skip","fast"),signal("hide","hide")],[],now);expect(profile.categories.get("hide")!).toBeLessThan(profile.categories.get("fast")!)});
  it("un signalement ne pénalise pas la catégorie",()=>expect(computeUserAffinity([signal("report")],[],now).categories.size).toBe(0));
  it("applique la décroissance sur 90 jours",()=>expect(decayWeight(1,"2026-04-15T00:00:00Z",now)).toBeCloseTo(Math.exp(-1),2));
  it("borne les poids",()=>{const profile=computeUserAffinity(Array.from({length:30},()=>signal("comment")),[],now);expect(profile.categories.get("cat")).toBe(3)});
});

describe("score V1",()=>{
  const now=new Date("2026-07-14T00:00:00Z");
  it("reste normalisé sur 100 et expose toutes ses composantes",()=>{const scored=computeQuestionScore(candidate(),emptyAffinity,now);expect(scored.finalScore).toBeGreaterThanOrEqual(0);expect(scored.finalScore).toBeLessThanOrEqual(100);expect(Object.keys(scored.scoreComponents)).toHaveLength(10)});
  it("lisse les petits volumes",()=>expect(smoothedRate(2,2,0.5)).toBeLessThan(0.55));
  it("bonifie une question jamais vue",()=>{const fresh=computeQuestionScore(candidate({lastShownAt:null}),emptyAffinity,now);const seen=computeQuestionScore(candidate({lastShownAt:"2026-07-13T12:00:00Z"}),emptyAffinity,now);expect(fresh.scoreComponents.novelty).toBeGreaterThan(seen.scoreComponents.novelty)});
  it("bonifie une question sous-exposée",()=>{const low=computeQuestionScore(candidate({impressionCount:0}),emptyAffinity,now);const known=computeQuestionScore(candidate({impressionCount:500}),emptyAffinity,now);expect(low.scoreComponents.exploration).toBeGreaterThan(known.scoreComponents.exploration)});
  it("laisse toute décision liée aux signalements à l’administration",()=>expect(computeQuestionScore(candidate({reportCount:30,impressionCount:100}),emptyAffinity,now).scoreComponents.reportPenalty).toBe(0));
  it("pénalise toute impression sans réponse indépendamment de sa durée",()=>{const ignored=computeQuestionScore(candidate({impressionCount:100,voteCount:10,fastSkipCount:0}),emptyAffinity,now);const answered=computeQuestionScore(candidate({impressionCount:100,voteCount:100,fastSkipCount:0}),emptyAffinity,now);expect(ignored.scoreComponents.unansweredPenalty).toBeLessThan(answered.scoreComponents.unansweredPenalty)});
  it("convertit la priorité éditoriale",()=>expect(computeQuestionScore(candidate({publicationPriority:100}),emptyAffinity,now).scoreComponents.editorialPriority).toBe(5));
});

describe("diversité de session",()=>{
  const scored=(item:Candidate,score:number)=>({...item,finalScore:score,scoreComponents:computeQuestionScore(item,emptyAffinity,new Date("2026-07-14T00:00:00Z")).scoreComponents});
  it("évite deux catégories identiques lorsque possible",()=>{const a=candidate({categoryId:"same"});const b=candidate({categoryId:"same"});const c=candidate({categoryId:"other"});const result=rerankWithSessionConstraints([scored(a,10),scored(b,9),scored(c,8)],[],3);expect(result[1].categoryId).toBe("other")});
  it("limite univers et sujets sensibles dans une fenêtre de cinq",()=>{const items=Array.from({length:5},(_,index)=>scored(candidate({universeId:index<3?"same":`u${index}`,sensitivity:index<3?"high":"low"}),10-index));const result=rerankWithSessionConstraints(items,[],5);expect(result.slice(0,3).filter(x=>x.universeId==="same").length).toBeLessThanOrEqual(2);expect(result.slice(0,3).filter(x=>x.sensitivity==="high").length).toBeLessThanOrEqual(2)});
  it("interdit une sponsorisée dans les trois premières et deux consécutives",()=>{const sponsored=scored(candidate({sponsoredBy:"Marque",sourcePool:"sponsored"}),100);const normals=Array.from({length:4},(_,i)=>scored(candidate(),90-i));const result=rerankWithSessionConstraints([sponsored,...normals],[],5);expect(result.slice(0,3).some(x=>x.sponsoredBy)).toBe(false)});
  it("évite trois formats identiques consécutifs et les mêmes tags",()=>{const items=[scored(candidate({format:"opinion",tags:["x"]}),10),scored(candidate({format:"opinion",tags:["x"]}),9),scored(candidate({format:"opinion",tags:["y"]}),8),scored(candidate({format:"dilemme",tags:["z"]}),7)];const result=rerankWithSessionConstraints(items,[],4);expect(result[1].tags).not.toContain("x");expect(result.slice(0,3).every(x=>x.format==="opinion")).toBe(false)});
  it("reste déterministe quand les contraintes sont impossibles",()=>{const items=Array.from({length:3},(_,i)=>scored(candidate({categoryId:"same"}),10-i));expect(rerankWithSessionConstraints(items,[],3).map(x=>x.questionId)).toEqual(rerankWithSessionConstraints(items,[],3).map(x=>x.questionId))});
});
