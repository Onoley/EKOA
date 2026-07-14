import Link from "next/link";
import { requireActiveProfile } from "@/features/auth/authorization";
import { discoverQuestions } from "@/features/discovery/queries";
import { DiscoveryQuestionList } from "@/features/discovery/question-list";
import { discoveryQuerySchema } from "@/features/discovery/schema";
import { setCategoryFollow } from "@/features/onboarding/category-actions";

type SearchParams=Record<string,string|string[]|undefined>;
function paginationHref(values:{q:string;category?:string;mode?:string;cursor:string}){const params=new URLSearchParams();if(values.q)params.set("q",values.q);if(values.category)params.set("category",values.category);if(values.mode)params.set("mode",values.mode);params.set("cursor",values.cursor);return `/explorer?${params}`;}

export default async function ExplorerPage({searchParams}:{searchParams:Promise<SearchParams>}){
  const {supabase,profile}=await requireActiveProfile();
  const raw=await searchParams;
  const parsed=discoveryQuerySchema.safeParse({q:typeof raw.q==="string"?raw.q:undefined,category:typeof raw.category==="string"?raw.category:undefined,cursor:typeof raw.cursor==="string"?raw.cursor:undefined,mode:typeof raw.mode==="string"?raw.mode:undefined});
  const [{data:categories,error:categoryError},{data:follows}]=await Promise.all([
    supabase.from("categories").select("id,slug,name,description").eq("is_active",true).order("display_order"),
    supabase.from("category_follows").select("category_id").eq("user_id",profile.user_id),
  ]);
  const followed=new Set(follows?.map((row)=>row.category_id));
  const input=parsed.success?parsed.data:{q:""};
  const selectedCategory=categories?.find((category)=>category.slug===input.category);
  const invalidCategory=Boolean(input.category&&!selectedCategory);
  const mode=input.q?"search":input.mode??"trending";
  const mainPage=!invalidCategory?await discoverQuestions({userId:profile.user_id,mode,query:input.q,category:input.category,cursor:input.cursor}):null;
  const error=!parsed.success?"Vérifiez les paramètres de recherche.":invalidCategory?"Cette catégorie n’est pas disponible.":mainPage?.error;
  return <main className="explorer-page pb-6">
    <header className="explorer-hero">
      <div className="px-5 pt-5"><p className="text-xs font-bold uppercase tracking-[.16em] text-[var(--accent)]">Découvrir</p><h1 className="mt-1 text-3xl font-black tracking-[-.045em] text-[var(--foreground)]">Rechercher</h1></div>
      <form className="explorer-search" role="search"><label htmlFor="discovery-search" className="sr-only">Rechercher</label><span aria-hidden="true">⌕</span><input id="discovery-search" name="q" defaultValue={input.q} maxLength={100} placeholder="Questions, thèmes, comptes…" />{input.category?<input type="hidden" name="category" value={input.category}/>:null}<button type="submit">Chercher</button></form>
      {categoryError?<div role="alert" className="mx-5 mt-3 rounded-xl bg-red-50 p-3 text-sm text-red-800">Impossible de charger les catégories.</div>:categories?.length?<nav className="explorer-categories" aria-label="Catégories"><Link href="/explorer" aria-current={!input.category?"page":undefined} className={!input.category?"active":""}>Pour vous</Link>{categories.map((category)=><Link key={category.id} href={`/fil?category=${category.slug}`}>{category.name}</Link>)}</nav>:null}
    </header>
    <div className="px-4 sm:px-5">
      {!input.q?<nav className="explorer-mode-tabs flex justify-center gap-8" aria-label="Type de découverte"><Link href="/explorer?mode=trending" aria-current={mode==="trending"?"page":undefined} className={`feed-tab ${mode==="trending"?"feed-tab-active":""}`}>Tendances</Link><Link href="/explorer?mode=recent" aria-current={mode==="recent"?"page":undefined} className={`feed-tab ${mode==="recent"?"feed-tab-active":""}`}>Nouveautés</Link></nav>:null}
      {error?<div role="alert" className="error-state mt-5">{error}</div>:null}
      {mainPage&&!error?<section className="mt-6" aria-labelledby={mode==="search"?"results-title":undefined}>{mode==="search"?<div className="mb-3 flex items-end justify-between gap-3"><div><h2 id="results-title" className="text-xl font-black tracking-tight">Résultats</h2><p role="status" className="mt-1 text-xs text-[var(--muted)]">{mainPage.items.length} résultat{mainPage.items.length>1?"s":""}</p></div><Link href="/explorer" className="text-sm font-bold">Effacer</Link></div>:null}<DiscoveryQuestionList items={mainPage.items} emptyMessage={mode==="trending"?"Aucune tendance pour le moment.":mode==="recent"?"Aucune question récente.":"Aucune question ne correspond à votre recherche."}/>{mainPage.nextCursor?<Link className="secondary-button mt-4 w-full" href={paginationHref({q:input.q,category:input.category,mode,cursor:mainPage.nextCursor})}>Afficher la suite</Link>:null}</section>:null}
      {categories?.length?<details className="category-manager mt-7"><summary>Gérer mes catégories <span aria-hidden="true">›</span></summary><ul>{categories.map((category)=>{const isFollowed=followed.has(category.id);return <li key={category.id}><div><Link href={`/fil?category=${category.slug}`}>{category.name}</Link><p>{category.description}</p></div><form action={setCategoryFollow}><input type="hidden" name="categoryId" value={category.id}/><input type="hidden" name="intent" value={isFollowed?"unfollow":"follow"}/><button className={isFollowed?"secondary-button compact":"primary-button compact"} aria-pressed={isFollowed}>{isFollowed?"Suivie":"Suivre"}</button></form></li>})}</ul></details>:null}
    </div>
  </main>;
}
