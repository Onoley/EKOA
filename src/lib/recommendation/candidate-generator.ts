import "server-only";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { RECOMMENDATION_CONFIG } from "./constants";
import type { Candidate, InteractionSignal, QuestionFormat } from "./types";

const rawCandidateSchema = z.object({
  question_id: z.uuid(), question_text: z.string(), author_id: z.uuid(), author_username: z.string().nullable(), author_verified: z.boolean(),
  category_id: z.uuid(), category_slug: z.string(), category_name: z.string(), universe_id: z.uuid(), universe_slug: z.string(), published_at: z.iso.datetime({ offset: true }),
  options: z.array(z.object({ id: z.uuid(), text: z.string() })).min(2).max(6), tags: z.array(z.string()),
  sensitivity: z.enum(["low", "medium", "high"]), question_format: z.enum(["opinion", "projection", "regulation", "comportement", "dilemme"]), editorial_type: z.string(), publication_priority: z.number().int().min(0).max(100), target_min_age:z.number().int().nullable(),target_max_age:z.number().int().nullable(),is_active:z.boolean(),moderation_eligible:z.boolean(),sponsor_eligible:z.boolean(),
  vote_count: z.number().int().nonnegative(), upvote_count: z.number().int().nonnegative(), comment_count: z.number().int().nonnegative(), report_count: z.number().int().nonnegative(), impression_count: z.number().int().nonnegative(), fast_skip_count: z.number().int().nonnegative(),
  followed_category: z.boolean(), followed_author: z.boolean(), initially_followed: z.boolean(), last_shown_at: z.iso.datetime({ offset: true }).nullable(), sponsored_by: z.string().nullable(),
  source_pool: z.enum(["explicit", "learned", "neighbor", "exploration", "editorial", "sponsored"]),
});

type CandidateInput = z.infer<typeof rawCandidateSchema>;

function toCandidate(row: CandidateInput, featuredIds: Set<string>): Candidate {
  return {
    questionId: row.question_id, questionText: row.question_text, authorId: row.author_id, authorUsername: row.author_username ?? "membre supprimé", authorVerified: row.author_verified,
    categoryId: row.category_id, categorySlug: row.category_slug, categoryName: row.category_name, universeId: row.universe_id, universeSlug: row.universe_slug,
    publishedAt: row.published_at, options: row.options, tags: row.tags, sensitivity: row.sensitivity, format: row.question_format, editorialType: row.editorial_type,
    publicationPriority: row.publication_priority,adminFeatured:featuredIds.has(row.question_id)&&row.last_shown_at===null,targetMinAge:row.target_min_age,targetMaxAge:row.target_max_age,isActive:row.is_active,moderationEligible:row.moderation_eligible,sponsorEligible:row.sponsor_eligible, voteCount: row.vote_count, upvoteCount: row.upvote_count, commentCount: row.comment_count, reportCount: row.report_count,
    impressionCount: row.impression_count, fastSkipCount: row.fast_skip_count, followedCategory: row.followed_category, followedAuthor: row.followed_author,
    initiallyFollowed: row.initially_followed, lastShownAt: row.last_shown_at, sponsoredBy: row.sponsored_by, sourcePool: row.source_pool,
  };
}

export async function generateCandidates(db: SupabaseClient, input: { userId: string; feed: "for_you" | "following"; categorySlug?: string; sessionId: string; snapshot: string }) {
  const { data, error } = await db.rpc("get_recommendation_candidates_v1", {
    requested_user_id: input.userId, requested_feed: input.feed, requested_category_slug: input.categorySlug ?? null,
    requested_session_id: input.sessionId, requested_snapshot: input.snapshot, requested_limit: RECOMMENDATION_CONFIG.maxCandidates,
  });
  if (error) throw new Error(`recommendation_candidates_failed:${error.code}`);
  const rows=z.array(rawCandidateSchema).parse(data??[]);
  const ids=rows.map((row)=>row.question_id);
  const{data:featured,error:featuredError}=ids.length?await db.from("questions").select("id").in("id",ids).gt("featured_until",input.snapshot):{data:[],error:null};
  if(featuredError)throw new Error("recommendation_featured_lookup_failed");
  const featuredIds=new Set((featured??[]).map((row)=>row.id as string));
  return rows.map((row)=>toCandidate(row,featuredIds));
}

type RawEvent = { event_type: string; occurred_at: string; dwell_ms: number | null; impression_id: string | null; category_id: string | null; question_id: string | null };
type QuestionMeta = { id: string; category_id: string; question_format: QuestionFormat | null; categories: { universe_id: string | null } | Array<{ universe_id: string | null }> | null; question_tags: Array<{ tags: { slug: string | null } | Array<{ slug: string | null }> | null }> };

export async function loadAffinityInputs(db: SupabaseClient, userId: string, now: Date) {
  const since = new Date(now.getTime() - RECOMMENDATION_CONFIG.interestDecayDays * 86_400_000).toISOString();
  const [{ data: events, error: eventError }, { data: follows, error: followError }] = await Promise.all([
    db.from("interaction_events").select("event_type,occurred_at,dwell_ms,impression_id,category_id,question_id").eq("user_id", userId).gte("occurred_at", since).order("occurred_at", { ascending: false }).limit(1000),
    db.from("category_follows").select("category_id,categories(universe_id)").eq("user_id", userId),
  ]);
  if (eventError || followError) throw new Error("recommendation_affinity_inputs_failed");
  const rawEvents = (events ?? []) as RawEvent[];
  const questionIds = [...new Set(rawEvents.flatMap((event) => event.question_id ? [event.question_id] : []))];
  const { data: metadata, error: metadataError } = questionIds.length ? await db.from("questions").select("id,category_id,question_format,categories(universe_id),question_tags(tags(slug))").in("id", questionIds) : { data: [], error: null };
  if (metadataError) throw new Error("recommendation_affinity_metadata_failed");
  const byQuestion = new Map(((metadata ?? []) as unknown as QuestionMeta[]).map((question) => [question.id, question]));
  const dwellByImpression = new Map(rawEvents.filter((event) => event.event_type === "dwell" && event.impression_id).map((event) => [event.impression_id!, event.dwell_ms ?? 0]));
  const signals: InteractionSignal[] = rawEvents.flatMap((event) => {
    if (!["answer", "upvote", "comment", "report", "skip"].includes(event.event_type)) return [];
    const question = event.question_id ? byQuestion.get(event.question_id) : undefined;
    const category = Array.isArray(question?.categories) ? question.categories[0] : question?.categories;
    const type = event.event_type === "skip" && event.impression_id && (dwellByImpression.get(event.impression_id) ?? Infinity) < RECOMMENDATION_CONFIG.fastSkipThresholdMs ? "fast_skip" : event.event_type;
    if (type === "skip") return [];
    const tags = question?.question_tags.flatMap((link) => { const tag = Array.isArray(link.tags) ? link.tags[0] : link.tags; return tag?.slug ? [tag.slug] : []; }) ?? [];
    return [{ type: type as InteractionSignal["type"], occurredAt: event.occurred_at, categoryId: event.category_id ?? question?.category_id ?? null, universeId: category?.universe_id ?? null, format: question?.question_format ?? null, tags }];
  });
  const followedCategories = (follows ?? []).flatMap((follow) => { const category = Array.isArray(follow.categories) ? follow.categories[0] : follow.categories; return category?.universe_id ? [{ categoryId: follow.category_id, universeId: category.universe_id }] : []; });
  return { signals, followedCategories };
}
