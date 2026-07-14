import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionContext } from "@/features/auth/authorization";
import { decodeCursor, encodeCursor } from "@/features/feed/cursor";
import { ALGORITHM_VERSION, categorySlugSchema, feedItemSchema, feedTypeSchema } from "@/features/feed/schema";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildRecommendationBlock, RECOMMENDATION_CONFIG } from "@/lib/recommendation";
import { createFeedSession, getReservedPage, validateFeedSession } from "@/lib/recommendation/reservation";

const querySchema = z.object({ type: feedTypeSchema.default("for_you"), category: categorySlugSchema.optional(), cursor: z.string().max(4096).optional(), debug:z.enum(["0","1"]).optional() });

export async function GET(request: Request) {
  const context = await getSessionContext();
  if (!context.userId || context.profile?.account_status !== "active" || !context.profile.birth_year) return NextResponse.json({ message: "Authentification requise." }, { status: 401 });
  const parsed = querySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success) return NextResponse.json({ message: "Paramètres de fil invalides." }, { status: 400 });
  const prior = parsed.data.cursor ? decodeCursor(parsed.data.cursor) : null;
  if (parsed.data.cursor && !prior) return NextResponse.json({ message: "Ce fil a expiré. Actualisez la page." }, { status: 400 });
  const admin=createAdminClient();
  const session=prior?await validateFeedSession(admin,context.userId,prior.sessionId):await createFeedSession(admin,{userId:context.userId,feed:parsed.data.type,categorySlug:parsed.data.category});
  if(!session || session.feed!==parsed.data.type || (session.categorySlug??undefined)!==parsed.data.category) return NextResponse.json({message:"Ce fil a expiré. Actualisez la page."},{status:400});
  const offset=prior?.offset??0;
  let page;
  let performanceMs:number|undefined;
  let debugTrace:unknown;
  try{
    page=await getReservedPage(admin,context.userId,session.id,offset);
    if(page.length<RECOMMENDATION_CONFIG.pageSize){
      const result=await buildRecommendationBlock({db:admin,userId:context.userId,age:new Date().getFullYear()-context.profile.birth_year,feed:parsed.data.type,categorySlug:parsed.data.category,sessionId:session.id,snapshot:session.snapshot},process.env.NODE_ENV!=="production"&&parsed.data.debug==="1");
      performanceMs=result.durationMs;debugTrace=result.trace;
      page=await getReservedPage(admin,context.userId,session.id,offset);
    }
  }catch(error){console.warn("feed.recommendation_failed",{code:error instanceof Error?error.message.split(":")[0]:"unknown"});return NextResponse.json({message:"Le fil est momentanément indisponible."},{status:503});}
  const items=page.map((row)=>feedItemSchema.parse({question_id:row.question_id,question_text:row.question_text,author_id:row.author_id,author_username:row.author_username,author_verified:row.author_verified,category_id:row.category_id,category_name:row.category_name,published_at:row.published_at,options:row.options,upvote_count:row.upvote_count,initially_followed:row.initially_followed,initially_upvoted:row.initially_upvoted,sponsored_by:row.sponsored_by}));
  const nextCursor=items.length===RECOMMENDATION_CONFIG.pageSize?encodeCursor({version:ALGORITHM_VERSION,sessionId:session.id,snapshot:session.snapshot,offset:offset+items.length}):null;
  return NextResponse.json({items,nextCursor,requestId:session.id,sessionId:session.id,algorithmVersion:ALGORITHM_VERSION,...(performanceMs===undefined?{}:{generationMs:performanceMs}),...(debugTrace?{debug:debugTrace}:{})});
}
