import "server-only";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { decodeDiscoveryCursor, encodeDiscoveryCursor } from "./cursor";
import { discoveryResultSchema, type DiscoveryResult } from "./schema";
import { getActiveSponsorships } from "@/features/sponsorship/queries";

const PAGE_SIZE = 12;
type Input = { userId: string; mode: "search" | "recent" | "trending"; query?: string; category?: string; cursor?: string; limit?: number };
export type DiscoveryPage = { items: DiscoveryResult[]; nextCursor: string | null; error?: string };

export async function discoverQuestions(input: Input): Promise<DiscoveryPage> {
  const query = input.query?.trim() ?? "";
  const prior = input.cursor ? decodeDiscoveryCursor(input.cursor) : null;
  if (input.cursor && (!prior || prior.mode!==input.mode || prior.query!==query || prior.category!==(input.category ?? null))) return { items:[],nextCursor:null,error:"Cette page de résultats a expiré." };
  const snapshot=prior?.snapshot ?? new Date().toISOString();
  const offset=prior?.offset ?? 0;
  const limit=input.limit ?? PAGE_SIZE;
  const {data,error}=await createAdminClient().rpc("discover_questions",{
    requested_user_id:input.userId,requested_mode:input.mode,requested_query:query || null,
    requested_category_slug:input.category ?? null,requested_snapshot:snapshot,requested_offset:offset,requested_limit:limit+1,
  });
  if(error) {console.warn("discovery.query_failed",{code:error.code});return {items:[],nextCursor:null,error:"La recherche est momentanément indisponible."};}
  const baseSchema=discoveryResultSchema.omit({sponsored_by:true});const base=z.array(baseSchema).safeParse(data ?? []);
  if(!base.success) {console.warn("discovery.response_invalid",base.error.issues.map(({code,path})=>({code,path})));return {items:[],nextCursor:null,error:"La recherche est momentanément indisponible."};}
  let sponsorships:Map<string,string>;try{sponsorships=await getActiveSponsorships(base.data.map(item=>item.question_id));}catch{console.warn("discovery.sponsorships_failed");return{items:[],nextCursor:null,error:"La recherche est momentanément indisponible."}}
  const parsed=z.array(discoveryResultSchema).safeParse(base.data.map(item=>({...item,sponsored_by:sponsorships.get(item.question_id)??null})));
  if(!parsed.success)return{items:[],nextCursor:null,error:"La recherche est momentanément indisponible."};
  const hasMore=parsed.data.length>limit;
  return {items:parsed.data.slice(0,limit),nextCursor:hasMore?encodeDiscoveryCursor({version:1,mode:input.mode,query,category:input.category ?? null,snapshot,offset:offset+limit}):null};
}
