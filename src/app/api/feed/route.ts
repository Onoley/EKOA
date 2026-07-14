import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionContext } from "@/features/auth/authorization";
import { decodeCursor, encodeCursor } from "@/features/feed/cursor";
import { diversify, rankCandidates } from "@/features/feed/ranking";
import { ALGORITHM_VERSION, candidateSchema, categorySlugSchema, feedItemSchema, feedTypeSchema } from "@/features/feed/schema";
import { createAdminClient } from "@/lib/supabase/admin";
import { getActiveSponsorships } from "@/features/sponsorship/queries";

const querySchema = z.object({ type: feedTypeSchema.default("for_you"), category: categorySlugSchema.optional(), cursor: z.string().max(4096).optional() });
const PAGE_SIZE = 5;

export async function GET(request: Request) {
  const context = await getSessionContext();
  if (!context.userId || context.profile?.account_status !== "active") return NextResponse.json({ message: "Authentification requise." }, { status: 401 });
  const parsed = querySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success) return NextResponse.json({ message: "Paramètres de fil invalides." }, { status: 400 });
  const prior = parsed.data.cursor ? decodeCursor(parsed.data.cursor) : null;
  if (parsed.data.cursor && !prior) return NextResponse.json({ message: "Ce fil a expiré. Actualisez la page." }, { status: 400 });
  const snapshot = prior?.snapshot ?? new Date().toISOString();
  const requestId = crypto.randomUUID();
  const admin = createAdminClient();
  const candidateRequest = parsed.data.category
    ? admin.rpc("get_category_feed_candidates", { requested_user_id: context.userId, requested_category_slug: parsed.data.category, requested_snapshot: snapshot, requested_limit: 100 })
    : admin.rpc("get_feed_candidates", { requested_user_id: context.userId, requested_feed: parsed.data.type, requested_snapshot: snapshot, requested_limit: 100 });
  const { data, error } = await candidateRequest;
  if (error) {
    console.warn("feed.candidates_failed", { code: error.code });
    return NextResponse.json({ message: "Le fil est momentanément indisponible." }, { status: 503 });
  }
  const candidates = z.array(candidateSchema).safeParse(data ?? []);
  if (!candidates.success) {
    console.warn("feed.candidates_invalid", candidates.error.issues.map(({ code, path }) => ({ code, path })));
    return NextResponse.json({ message: "Le fil est momentanément indisponible." }, { status: 503 });
  }
  const seen = new Set(prior?.seen ?? []);
  const available = candidates.data.filter((item) => !seen.has(item.question_id));
  const ranked = rankCandidates(available, new Date(snapshot), requestId, prior?.recentAuthors, prior?.recentCategories);
  const selected = diversify(ranked, prior?.recentAuthors, prior?.recentCategories).slice(0, PAGE_SIZE);
  const selectedIds = selected.map((item) => item.question_id);
  const { data: upvotes, error: upvotesError } = selectedIds.length
    ? await admin.from("question_upvotes").select("question_id").eq("user_id", context.userId).in("question_id", selectedIds)
    : { data: [], error: null };
  if (upvotesError) {
    console.warn("feed.upvotes_failed", { code: upvotesError.code });
    return NextResponse.json({ message: "Le fil est momentanément indisponible." }, { status: 503 });
  }
  const upvotedIds = new Set(upvotes?.map((row) => row.question_id) ?? []);
  let sponsorships:Map<string,string>;try{sponsorships=await getActiveSponsorships(selected.map((item)=>item.question_id));}catch{console.warn("feed.sponsorships_failed");return NextResponse.json({message:"Le fil est momentanément indisponible."},{status:503});}
  const allSeen = [...(prior?.seen ?? []), ...selected.map((item) => item.question_id)].slice(-200);
  const recentAuthors = [...(prior?.recentAuthors ?? []), ...selected.map((item) => item.author_id)].slice(-2);
  const recentCategories = [...(prior?.recentCategories ?? []), ...selected.map((item) => item.category_id)].slice(-2);
  const nextCursor = selected.length === PAGE_SIZE && available.length > PAGE_SIZE ? encodeCursor({ version: ALGORITHM_VERSION, snapshot, seen: allSeen, recentAuthors, recentCategories }) : null;
  return NextResponse.json({ items: selected.map((item) => feedItemSchema.parse({...item, initially_upvoted: upvotedIds.has(item.question_id), sponsored_by:sponsorships.get(item.question_id)??null})), nextCursor, requestId, algorithmVersion: ALGORITHM_VERSION });
}
