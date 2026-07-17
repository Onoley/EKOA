import { notFound } from "next/navigation";
import { requireActiveProfile } from "@/features/auth/authorization";
import { resultsSchema } from "@/features/voting/schema";
import { getActiveSponsorships } from "@/features/sponsorship/queries";
import Link from "next/link";
import {Feed} from "@/features/feed/feed";
import {feedItemSchema} from "@/features/feed/schema";
import {getAdminProfileIds} from "@/features/profile/admin-badge";
import {createAdminClient} from "@/lib/supabase/admin";

export default async function QuestionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, profile } = await requireActiveProfile();
  const { data: question } = await supabase.from("questions").select("id,author_id,category_id,text,status,target_min_age,target_max_age,published_at").eq("id", id).eq("status", "published").in("moderation_status", ["clear", "approved"]).maybeSingle();
  if (!question) notFound();

  const age = new Date().getFullYear() - (profile.birth_year ?? new Date().getFullYear());
  if ((question.target_min_age !== null && age < question.target_min_age) || (question.target_max_age !== null && age > question.target_max_age)) notFound();

  const [{ data: options }, { data: category }, { data: author }, { data: vote }, { data: follow }, { data: engagement }] = await Promise.all([
    supabase.from("question_options").select("id,text").eq("question_id", id).order("position"),
    supabase.from("categories").select("name").eq("id", question.category_id).single(),
    supabase.rpc("get_public_question_author", { requested_user_id: question.author_id }),
    supabase.from("votes").select("option_id").eq("question_id", id).eq("user_id", profile.user_id).maybeSingle(),
    supabase.from("question_follows").select("question_id").eq("question_id", id).eq("user_id", profile.user_id).maybeSingle(),
    supabase.rpc("get_question_engagement", { requested_question_id: id }),
  ]);
  if (!options?.length || !category || !Array.isArray(author) || !author[0]) notFound();
  const sponsorships=await getActiveSponsorships([id]);
  const adminClient=createAdminClient();
  const[adminProfileIds,{data:featuredQuestion}]=await Promise.all([getAdminProfileIds(adminClient,[question.author_id]),adminClient.from("questions").select("id").eq("id",id).gt("featured_until",new Date().toISOString()).maybeSingle()]);

  let initialResults;
  if (vote) {
    const { data } = await supabase.rpc("get_question_results", { requested_question_id: id });
    const parsed = resultsSchema.safeParse(data);
    if (parsed.success) initialResults = parsed.data;
  }
  const engagementRow = Array.isArray(engagement) ? engagement[0] : undefined;
  const initialItem=feedItemSchema.parse({question_id:id,question_text:question.text,author_id:question.author_id,author_username:author[0].username,author_verified:author[0].account_type==="verified",author_is_admin:adminProfileIds.has(question.author_id),admin_featured:Boolean(featuredQuestion),category_id:question.category_id,category_name:category.name,published_at:question.published_at,options,upvote_count:engagementRow?.upvote_count??0,initially_followed:Boolean(follow),initially_upvoted:engagementRow?.is_upvoted??false,sponsored_by:sponsorships.get(id)??null});
  return <div className="question-page relative bg-white"><Link href="/fil" className="question-back-button" aria-label="Retour au fil">←</Link><Feed type="for_you" canAdminister={profile.role==="admin"} initialQuestion={{item:initialItem,results:initialResults,requestId:crypto.randomUUID()}}/></div>;
}
