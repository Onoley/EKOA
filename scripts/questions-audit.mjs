import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import XLSX from "xlsx";

import { categories, tags, universes } from "../taxonomy/catalog.mjs";

const file=resolve(process.argv[2]??"imports/ekoa_questions.xlsx");
const output=resolve("reports/questions-editorial-audit.json");
const workbook=XLSX.readFile(file,{raw:false});
const sheet=workbook.Sheets.Questions;
if(!sheet)throw new Error("Feuille Questions absente.");
const rows=XLSX.utils.sheet_to_json(sheet,{defval:"",raw:false}).map((row,index)=>({...row,__row:index+2}));
const normalize=(value)=>String(value??"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]+/g," ").trim().replace(/\s+/g," ");
const distribution=(values)=>Object.fromEntries([...values.reduce((map,value)=>map.set(String(value),(map.get(String(value))??0)+1),new Map())].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0])));
const optionCount=(row)=>[1,2,3,4,5,6].filter((index)=>String(row[`option_${index}`]??"").trim()).length;
const tagValues=(row)=>[1,2,3].map((index)=>String(row[`tag_${index}`]??"").trim()).filter(Boolean);
const exactGroups=new Map();
for(const row of rows){const key=normalize(row.question);exactGroups.set(key,[...(exactGroups.get(key)??[]),row.__row]);}
const exactDuplicates=[...exactGroups.entries()].filter(([,lineNumbers])=>lineNumbers.length>1).map(([normalizedQuestion,lineNumbers])=>({normalizedQuestion,lineNumbers}));
const externalGroups=new Map();
for(const row of rows){const key=String(row.external_id);externalGroups.set(key,[...(externalGroups.get(key)??[]),row.__row]);}
const duplicateExternalIds=[...externalGroups.entries()].filter(([,lineNumbers])=>lineNumbers.length>1).map(([externalId,lineNumbers])=>({externalId,lineNumbers}));

const tokens=rows.map((row)=>new Set(normalize(row.question).split(" ").filter((token)=>token.length>2)));
const similarities=[];
for(let left=0;left<rows.length;left+=1){for(let right=left+1;right<rows.length;right+=1){
  const a=tokens[left],b=tokens[right];let intersection=0;for(const token of a)if(b.has(token))intersection+=1;
  const score=intersection/(a.size+b.size-intersection||1);
  if(score>=0.72)similarities.push({rowA:rows[left].__row,rowB:rows[right].__row,score:Number(score.toFixed(3)),questionA:rows[left].question,questionB:rows[right].question});
}}
similarities.sort((a,b)=>b.score-a.score);

const loadedPattern=/\b(?:mauvais|injuste|absurde|honteux|scandaleux|dangereux|toxique|évident|vraiment|enfin|récompense souvent davantage|devrait obligatoirement|ne devrait jamais)\b/i;
const potentiallyLeading=rows.filter((row)=>loadedPattern.test(normalize(row.question))).map((row)=>({row:row.__row,question:row.question,reason:"Vocabulaire potentiellement chargé ou présupposé."}));
const incompleteOptions=rows.filter((row)=>{
  const count=optionCount(row);const question=normalize(row.question);const options=[1,2,3,4,5,6].map((index)=>normalize(row[`option_${index}`])).filter(Boolean);
  const nuance=options.some((value)=>/(depend|autre|ne sais|sans opinion|aucun|parfois|mitige)/.test(value));
  return count===2&&!nuance&&!/^(etes vous|seriez vous|avez vous|faut il|faudrait il|devrait on|pensez vous|preferez vous)/.test(question);
}).map((row)=>({row:row.__row,question:row.question,options:[1,2,3,4,5,6].map((index)=>row[`option_${index}`]).filter(Boolean),reason:"Question large limitée à deux choix sans option de nuance."}));

const categoryDistribution=distribution(rows.map((row)=>row.category_slug));
const expectedPerCategory=rows.length/categories.length;
const underrepresentedCategories=Object.entries(categoryDistribution).filter(([,count])=>count<expectedPerCategory*.75).map(([category,count])=>({category,count,expectedAverage:expectedPerCategory}));
const tagDistribution=distribution(rows.flatMap(tagValues));
const overusedTags=Object.entries(tagDistribution).filter(([,count])=>count>rows.length*.1).map(([tag,count])=>({tag,count,percentage:Number((count*100/rows.length).toFixed(1))}));
const sensitivityRank={low:0,medium:1,high:2};const tagBySlug=new Map(tags.map((tag)=>[tag.slug,tag]));
const sensitivityMismatches=rows.flatMap((row)=>tagValues(row).filter((slug)=>tagBySlug.has(slug)&&sensitivityRank[row.sensitivity]<sensitivityRank[tagBySlug.get(slug).sensitivity]).map((slug)=>({row:row.__row,declared:row.sensitivity,tag:slug,required:tagBySlug.get(slug).sensitivity})));

let validationReport=null;try{validationReport=JSON.parse(await readFile(resolve("reports/questions-import-validate.json"),"utf8"));}catch{}
const errorCodeDistribution=distribution((validationReport?.errors??[]).map((error)=>error.code));
const report={
  generatedAt:new Date().toISOString(),file,writePerformed:false,
  workbook:{sheets:workbook.SheetNames,headers:Object.keys(rows[0]??{}).filter((header)=>header!=="__row")},
  totals:{questions:rows.length,valid:validationReport?.validRows??null,invalid:validationReport?.invalidRows??null,warnings:(validationReport?.warnings??[]).length,blockingErrors:(validationReport?.errors??[]).length},
  distributions:{
    universes:distribution(rows.map((row)=>row.universe_slug)),categories:categoryDistribution,
    optionCounts:distribution(rows.map(optionCount)),sensitivities:distribution(rows.map((row)=>row.sensitivity)),
    editorialTypes:distribution(rows.map((row)=>row.editorial_type)),priorities:distribution(rows.map((row)=>row.publication_priority)),tags:tagDistribution,
  },
  taxonomy:{knownUniverses:universes.length,knownCategories:categories.length,knownTags:tags.length,underrepresentedCategories,overusedTags,sensitivityMismatches},
  duplicates:{externalIds:duplicateExternalIds,exactQuestions:exactDuplicates,strongSimilarities:similarities.slice(0,500),strongSimilarityCount:similarities.length},
  editorialHeuristics:{potentiallyLeading,possiblyIncompleteOptions:incompleteOptions,note:"Alertes heuristiques à relire humainement; elles ne constituent pas des erreurs automatiques."},
  validation:{errorCodeDistribution,errors:validationReport?.errors??[],warnings:validationReport?.warnings??[]},
  recommendations:[
    "Conserver la conversion documentée de ready vers published et des cinq formats vers question_format.",
    "Relire les niveaux de sensibilité signalés par l’heuristique avant publication.",
    "Maintenir la feuille Tags et la source canonique synchronisées avant chaque futur import.",
    "Relire humainement les similarités fortes et les alertes de formulation/options avant publication.",
  ],
};
await mkdir(resolve("reports"),{recursive:true});await writeFile(output,`${JSON.stringify(report,null,2)}\n`,{mode:0o600});
console.log(JSON.stringify({output,totals:report.totals,distributions:report.distributions,taxonomy:report.taxonomy,duplicateCounts:{externalIds:duplicateExternalIds.length,exactQuestions:exactDuplicates.length,strongSimilarities:similarities.length},editorialCounts:{potentiallyLeading:potentiallyLeading.length,possiblyIncompleteOptions:incompleteOptions.length},errorCodeDistribution},null,2));
