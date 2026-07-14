import { createClient } from "@supabase/supabase-js";
import { categories, tags, universes, validateCatalog } from "../taxonomy/catalog.mjs";

validateCatalog();
const url=process.env.NEXT_PUBLIC_SUPABASE_URL,secret=process.env.SUPABASE_SERVICE_ROLE_KEY;
if(!url||!secret)throw new Error("Configuration Supabase manquante.");
const db=createClient(url,secret,{auth:{persistSession:false}});
const count=async(table,configure=(query)=>query)=>{const result=await configure(db.from(table).select("*",{count:"exact",head:true}));if(result.error)throw result.error;return result.count??0};
const [universeCount,categoryCount,tagCount,questionCount,optionOrphans,tagOrphans]=await Promise.all([
  count("universes",(query)=>query.eq("is_active",true)),count("categories",(query)=>query.eq("is_active",true)),
  count("tags",(query)=>query.eq("is_active",true)),count("questions"),
  count("question_options",(query)=>query.is("question_id",null)),count("question_tags",(query)=>query.is("question_id",null)),
]);
if(universeCount!==7||categoryCount!==30||tagCount!==tags.length||optionOrphans||tagOrphans)throw new Error(`Contrôle invalide: univers=${universeCount}, catégories=${categoryCount}, tags=${tagCount}, options orphelines=${optionOrphans}, associations orphelines=${tagOrphans}.`);
const [databaseUniverses,databaseCategories,databaseTags]=await Promise.all([
  db.from("universes").select("slug").eq("is_active",true),db.from("categories").select("slug,universe_id").eq("is_active",true),db.from("tags").select("slug").eq("is_active",true),
]);
if(databaseUniverses.error||databaseCategories.error||databaseTags.error)throw databaseUniverses.error??databaseCategories.error??databaseTags.error;
const same=(actual,expected)=>actual.length===expected.length&&expected.every((slug)=>actual.includes(slug));
if(!same(databaseUniverses.data.map(({slug})=>slug),universes.map(({slug})=>slug))||!same(databaseCategories.data.map(({slug})=>slug),categories.map(({slug})=>slug))||!same(databaseTags.data.map(({slug})=>slug),tags.map(({slug})=>slug))||databaseCategories.data.some(({universe_id})=>!universe_id))throw new Error("La base ne correspond pas à la source canonique.");
console.log(`Taxonomie valide: 7 univers, 30 catégories, ${tags.length} tags, ${questionCount} questions et zéro donnée taxonomique orpheline.`);
