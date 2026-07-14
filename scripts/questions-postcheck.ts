import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { configuredClient, resolveEditorialIdentity } from "../src/features/question-import/database";

async function pages<T>(table: string, columns: string): Promise<T[]> {
  const db=configuredClient();const result:T[]=[];
  for(let from=0;;from+=500){const response=await db.from(table).select(columns).range(from,from+499);if(response.error)throw new Error(response.error.message);result.push(...response.data as T[]);if((response.data?.length??0)<500)return result;}
}
const distribution=(values:string[])=>Object.fromEntries([...values.reduce((map,value)=>map.set(value,(map.get(value)??0)+1),new Map<string,number>())].sort());
async function count(table:string){const result=await configuredClient().from(table).select("*",{count:"exact",head:true});if(result.error)throw new Error(result.error.message);return result.count??0;}

async function main(){
  const preflight=JSON.parse(await readFile(resolve("reports/questions-import-preflight.json"),"utf8")) as {before:{profiles:number;categoryFollows:number}};
  const identity=await resolveEditorialIdentity();
  const [questions,options,questionTags,categories,profileCount,followCount,first,official]=await Promise.all([
    pages<Record<string,unknown>>("questions","id,external_id,author_id,editorial_organisation_id,category_id,status,sensitivity,question_format"),
    pages<{question_id:string;position:number}>("question_options","question_id,position"),
    pages<{question_id:string;tag_id:string}>("question_tags","question_id,tag_id"),
    pages<{id:string;slug:string}>("categories","id,slug"),count("profiles"),count("category_follows"),
    configuredClient().from("profiles").select("role,account_status").eq("username_normalized","first").single(),
    configuredClient().from("profiles").select("role,account_status").eq("username_normalized","ekoa_demo").single(),
  ]);
  if(first.error||official.error)throw new Error(first.error?.message??official.error?.message);
  const ids=new Set(questions.map((question)=>String(question.id)));const externalIds=questions.map((question)=>String(question.external_id));
  const optionCounts=new Map<string,number>();for(const option of options){if(!ids.has(option.question_id))throw new Error("Option orpheline.");optionCounts.set(option.question_id,(optionCounts.get(option.question_id)??0)+1);}
  if(questions.length!==1500||options.length!==6000||new Set(externalIds).size!==1500)throw new Error("Cardinalités principales invalides.");
  if(questions.some((question)=>question.author_id!==identity.authorId||question.editorial_organisation_id!==null||!question.category_id||question.status!=="published"))throw new Error("Auteur, organisation, catégorie ou statut invalide.");
  if([...ids].some((id)=>(optionCounts.get(id)??0)!==4)||questionTags.some((relation)=>!ids.has(relation.question_id)))throw new Error("Options ou tags invalides.");
  if(profileCount!==preflight.before.profiles||followCount!==preflight.before.categoryFollows||first.data.role!=="user"||first.data.account_status!=="active"||official.data.role!=="admin"||official.data.account_status!=="active")throw new Error("Un profil ou abonnement a changé de façon inattendue.");
  const categoryById=new Map(categories.map((category)=>[category.id,category.slug]));
  const report={checkedAt:new Date().toISOString(),questions:questions.length,options:options.length,questionTagAssociations:questionTags.length,externalIdDuplicates:externalIds.length-new Set(externalIds).size,conflicts:0,allAuthorsOfficial:true,allOrganisationsNull:true,profilesUnchangedCount:true,categoryFollowsUnchanged:true,firstUnchanged:true,byCategory:distribution(questions.map((question)=>categoryById.get(String(question.category_id))??"unknown")),bySensitivity:distribution(questions.map((question)=>String(question.sensitivity))),byQuestionFormat:distribution(questions.map((question)=>String(question.question_format)))};
  if(Object.values(report.byCategory).some((total)=>total!==50))throw new Error("Répartition catégorie différente de 50.");
  await writeFile(resolve("reports/questions-import-postcheck.json"),`${JSON.stringify(report,null,2)}\n`,{mode:0o600});console.log(JSON.stringify(report,null,2));
}
main().catch((error:unknown)=>{console.error(error instanceof Error?error.message:"Erreur inconnue.");process.exitCode=1;});
