import { Feed } from "@/features/feed/feed";
import { requireActiveProfile } from "@/features/auth/authorization";
import { categorySlugSchema } from "@/features/feed/schema";
import { notFound } from "next/navigation";

export default async function FeedPage({ searchParams }: { searchParams: Promise<{ mode?: string; category?: string }> }) {
  const { mode, category: rawCategory } = await searchParams;
  let category: { slug: string; name: string } | undefined;
  if (rawCategory) {
    const parsed = categorySlugSchema.safeParse(rawCategory);
    if (!parsed.success) notFound();
    const { supabase } = await requireActiveProfile();
    const { data } = await supabase.from("categories").select("slug,name").eq("slug", parsed.data).eq("is_active", true).maybeSingle();
    if (!data) notFound();
    category = data;
  }
  return <Feed key={`${mode ?? "for_you"}-${category?.slug ?? "all"}`} type={mode === "suivis" ? "following" : "for_you"} category={category} />;
}
