import { notFound } from "next/navigation";
import { requireActiveProfile } from "@/features/auth/authorization";
import { QuestionForm, type QuestionInitial } from "@/features/questions/question-form";
import { createAdminClient } from "@/lib/supabase/admin";

export default async function CreatePage({ searchParams }: { searchParams: Promise<{ draft?: string; wave?: string }> }) {
  const { supabase, profile } = await requireActiveProfile();
  const admin = createAdminClient();
  const params = await searchParams;
  const [{ data: categories, error }, { data: tagLinks, error: tagError }] = await Promise.all([
    supabase.from("categories").select("id,name,universe_id,universes(name)").eq("is_active", true).order("display_order"),
    admin.from("category_tags").select("category_id,display_order,tags!inner(name,slug,is_active)").eq("tags.is_active", true).order("display_order"),
  ]);
  let initial: QuestionInitial = {};
  const sourceId = params.draft ?? params.wave;
  if (sourceId) {
    const { data: question } = await supabase.from("questions").select("id,text,category_id,target_min_age,target_max_age,status,author_id").eq("id", sourceId).eq("author_id", profile.user_id).maybeSingle();
    if (!question || (params.draft && question.status !== "draft") || (params.wave && question.status !== "published")) notFound();
    const [{ data: options }, { data: links }] = await Promise.all([
      supabase.from("question_options").select("text").eq("question_id", sourceId).order("position"),
      supabase.from("question_tags").select("tags(name)").eq("question_id", sourceId),
    ]);
    initial = { id: params.draft ? question.id : undefined, previousWaveId: params.wave ? question.id : undefined, text: question.text, categoryId: question.category_id, options: options?.map((item) => item.text), tags: links?.flatMap((link) => { const tag = link.tags as unknown as { name: string } | null; return tag ? [tag.name] : []; }), minAge: question.target_min_age, maxAge: question.target_max_age };
  }
  const categoryRows=(categories??[]).map((category)=>({id:category.id,name:category.name,universeName:(Array.isArray(category.universes)?category.universes[0]:category.universes)?.name??"Autres"}));
  const tagsByCategory=Object.fromEntries(categoryRows.map((category)=>[category.id,(tagLinks??[]).filter((link)=>link.category_id===category.id).flatMap((link)=>{const tag=Array.isArray(link.tags)?link.tags[0]:link.tags;return tag?[{name:tag.name,slug:tag.slug}]:[]})]));
  return <main className="create-page min-h-[calc(100dvh-4.75rem)] p-5"><header className="create-heading"><p>Nouvelle contribution</p><h1>{params.wave ? "Nouvelle vague" : params.draft ? "Modifier le brouillon" : "Créer une question"}</h1><span>Une question courte, neutre et utile à la communauté.</span></header>{error || tagError ? <div role="alert" className="error-state">Impossible de charger les catégories et leurs tags.</div> : categoryRows.length ? <QuestionForm categories={categoryRows} tagsByCategory={tagsByCategory} initial={initial} /> : <div className="empty-state">Aucune catégorie disponible.</div>}</main>;
}
