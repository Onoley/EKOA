import "server-only";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { RECOMMENDATION_CONFIG } from "./constants";
import type { RerankedCandidate, SessionHistoryItem } from "./types";

const pageRowSchema = z.object({
  question_id: z.uuid(),question_text:z.string(),author_id:z.uuid(),author_username:z.string().nullable(),author_verified:z.boolean(),category_id:z.uuid(),category_name:z.string(),published_at:z.iso.datetime({offset:true}),
  options:z.array(z.object({id:z.uuid(),text:z.string()})).min(2).max(6),upvote_count:z.number().int().nonnegative(),initially_followed:z.boolean(),initially_upvoted:z.boolean(),sponsored_by:z.string().nullable(),position:z.number().int().nonnegative(),source_pool:z.string(),final_score:z.coerce.number(),score_components:z.record(z.string(),z.number()),ranking_version:z.string(),experiment_variant:z.string(),
});

export async function createFeedSession(db: SupabaseClient, input: { userId: string; feed: "for_you" | "following"; categorySlug?: string }) {
  const now = new Date();
  const { data, error } = await db.from("feed_sessions").insert({ user_id: input.userId, feed: input.feed, category_slug: input.categorySlug ?? null, ranking_version: RECOMMENDATION_CONFIG.rankingVersion, experiment_variant: RECOMMENDATION_CONFIG.experimentVariant, expires_at: new Date(now.getTime() + RECOMMENDATION_CONFIG.sessionTtlHours * 3_600_000).toISOString() }).select("id,started_at").single();
  if (error) throw new Error(`recommendation_session_failed:${error.code}`);
  return { id: data.id as string, snapshot: data.started_at as string, feed:input.feed, categorySlug:input.categorySlug??null };
}

export async function validateFeedSession(db: SupabaseClient, userId: string, sessionId: string) {
  const { data, error } = await db.from("feed_sessions").select("id,started_at,feed,category_slug,expires_at").eq("id",sessionId).eq("user_id",userId).is("ended_at",null).gt("expires_at",new Date().toISOString()).maybeSingle();
  if (error || !data) return null;
  const renewedUntil=new Date(Date.now()+RECOMMENDATION_CONFIG.reservationTtlMinutes*60_000).toISOString();
  const {error:renewError}=await db.from("feed_reservations").update({expires_at:renewedUntil}).eq("session_id",sessionId).eq("user_id",userId);
  if(renewError)return null;
  return { id: data.id as string, snapshot: data.started_at as string, feed: data.feed as "for_you"|"following", categorySlug: data.category_slug as string|null };
}

export async function reserveFeedItems(db: SupabaseClient, userId: string, sessionId: string, items: RerankedCandidate[]) {
  const payload = items.map((item) => ({ questionId:item.questionId,sourcePool:item.sourcePool,finalScore:item.finalScore,scoreComponents:item.scoreComponents,appliedConstraints:item.appliedConstraints,relaxedConstraints:item.relaxedConstraints }));
  const { error } = await db.rpc("reserve_feed_items_v1", { requested_user_id:userId,requested_session_id:sessionId,requested_items:payload,requested_ttl_minutes:RECOMMENDATION_CONFIG.reservationTtlMinutes });
  if (error) throw new Error(`recommendation_reservation_failed:${error.code}`);
}

export async function getReservedPage(db: SupabaseClient,userId:string,sessionId:string,offset:number,limit=RECOMMENDATION_CONFIG.pageSize){
  const {data,error}=await db.rpc("get_feed_reservation_page_v1",{requested_user_id:userId,requested_session_id:sessionId,requested_offset:offset,requested_limit:limit});
  if(error)throw new Error(`recommendation_page_failed:${error.code}`);
  return z.array(pageRowSchema).parse(data??[]);
}

export async function loadSessionHistory(db: SupabaseClient, userId: string, sessionId: string): Promise<SessionHistoryItem[]> {
  const { data, error } = await db.rpc("get_feed_session_history_v1", { requested_user_id:userId,requested_session_id:sessionId });
  if (error) throw new Error("recommendation_history_failed");
  return (data ?? []).map((row: {question_id:string;category_id:string;category_slug:string;universe_id:string;universe_slug:string;tags:unknown;sensitivity:string;question_format:string;is_sponsored:boolean}) => ({questionId:row.question_id,categoryId:row.category_id,categorySlug:row.category_slug,universeId:row.universe_id,universeSlug:row.universe_slug,tags:Array.isArray(row.tags)?row.tags.filter((tag:unknown):tag is string=>typeof tag==="string"):[],sensitivity:row.sensitivity as SessionHistoryItem["sensitivity"],format:row.question_format as SessionHistoryItem["format"],sponsoredBy:row.is_sponsored?"sponsored":null}));
}
