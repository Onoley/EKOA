import {NextResponse} from "next/server";
import {z} from "zod";
import {getSessionContext} from "@/features/auth/authorization";
import {commentUpvoteResponseSchema} from "@/features/comments/schema";
import {createAdminClient} from "@/lib/supabase/admin";

const inputSchema=z.object({enabled:z.boolean()}).strict();

export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){
 const{id}=await params;const commentId=z.uuid().safeParse(id);const context=await getSessionContext();
 if(!context.userId||context.profile?.account_status!=="active")return NextResponse.json({message:"Authentification requise."},{status:401});
 let body:unknown;try{body=await request.json()}catch{return NextResponse.json({message:"Requête invalide."},{status:400})}
 const parsed=inputSchema.safeParse(body);if(!commentId.success||!parsed.success)return NextResponse.json({message:"Requête invalide."},{status:400});
 const{data,error}=await createAdminClient().rpc("set_comment_upvote_for_user",{requested_user_id:context.userId,requested_comment_id:commentId.data,requested_upvoted:parsed.data.enabled});
 if(error){console.warn("comment_upvote.failed",{code:error.code});return NextResponse.json({message:"L’upvote n’a pas pu être modifié."},{status:422})}
 const result=commentUpvoteResponseSchema.safeParse(Array.isArray(data)?data[0]:null);if(!result.success)return NextResponse.json({message:"Réponse invalide."},{status:503});
 return NextResponse.json(result.data);
}
