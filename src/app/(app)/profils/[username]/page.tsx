import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { requireActiveProfile } from "@/features/auth/authorization";
import { AdminNameBadge, ProfileAvatar } from "@/features/profile/avatar";
import { getAdminProfileIds } from "@/features/profile/admin-badge";
import { VerifiedFollowButton } from "@/features/profile/verified-follow-button";
import { getPublicEnv } from "@/lib/config/env";
import { createAdminClient } from "@/lib/supabase/admin";

const usernameSchema=z.string().regex(/^[A-Za-z0-9_]{3,24}$/);
export default async function PublicProfilePage({params}:{params:Promise<{username:string}>}){
 const raw=await params;const username=usernameSchema.safeParse(decodeURIComponent(raw.username));if(!username.success)notFound();
 const{supabase,profile:viewer}=await requireActiveProfile();const env=getPublicEnv();const{data}=await supabase.rpc("get_public_profile",{requested_username:username.data});
 const profile=Array.isArray(data)?data[0] as {user_id:string;username:string;account_type:"ordinary"|"verified";created_at:string;is_followed:boolean}|undefined:undefined;if(!profile)notFound();
 const[{data:questions,error},{data:verifiedRows},adminProfileIds]=await Promise.all([supabase.rpc("get_public_profile_questions",{requested_user_id:profile.user_id}),profile.account_type==="verified"?supabase.rpc("get_verified_public_details",{requested_user_id:profile.user_id}):Promise.resolve({data:null}),getAdminProfileIds(createAdminClient(),[profile.user_id])]);
 const verified=Array.isArray(verifiedRows)?verifiedRows[0] as {organisation_type:string;organisation_name:string;public_description:string}|undefined:undefined;
 const isAdmin=adminProfileIds.has(profile.user_id);
 return <main className="p-5"><Link href="/explorer" className="text-sm font-semibold underline">Retour à Explorer</Link><section className="mt-5 rounded-3xl border border-black/10 p-5"><ProfileAvatar userId={profile.user_id} username={profile.username} supabaseUrl={env.NEXT_PUBLIC_SUPABASE_URL} className="profile-page-avatar" verified={profile.account_type==="verified"} admin={isAdmin}/><div className="profile-name-row mt-4"><h1 className="text-2xl font-bold">@{profile.username}</h1>{isAdmin?<AdminNameBadge/>:null}</div><p className="mt-1 text-sm text-[var(--muted)]">{isAdmin?"Compte administrateur certifié":`Compte ${profile.account_type==="verified"?"vérifié":"ordinaire"}`}</p>{verified?<div className="mt-4 rounded-2xl bg-[var(--background)] p-4"><p className="font-bold">{verified.organisation_name}</p><p className="text-sm text-[var(--muted)]">{verified.organisation_type}</p>{verified.public_description?<p className="mt-2 leading-6">{verified.public_description}</p>:null}</div>:null}{profile.account_type==="verified"&&profile.user_id!==viewer.user_id?<div className="mt-5"><VerifiedFollowButton userId={profile.user_id} initiallyFollowed={profile.is_followed}/></div>:null}</section><section className="mt-7" aria-labelledby="public-questions"><h2 id="public-questions" className="text-xl font-bold">Questions publiées</h2>{error?<div role="alert" className="error-state mt-4">Impossible de charger les questions.</div>:questions?.length?<ul className="mt-4 space-y-3">{questions.map((q:{question_id:string;question_text:string})=><li key={q.question_id}><Link href={`/questions/${q.question_id}`} className="block rounded-2xl border border-black/10 p-4 font-semibold">{q.question_text}</Link></li>)}</ul>:<div className="empty-state mt-4">Aucune question publiée.</div>}</section></main>;
}
