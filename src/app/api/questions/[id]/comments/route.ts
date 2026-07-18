import {NextResponse} from "next/server";import {z} from "zod";
import {getSessionContext} from "@/features/auth/authorization";import {decodeCommentCursor,encodeCommentCursor} from "@/features/comments/cursor";import {commentSchema} from "@/features/comments/schema";
import {commentInputSchema} from "@/features/comments/schema";
import {createAdminClient} from "@/lib/supabase/admin";
import {logOperational} from "@/lib/observability/logger";
const querySchema=z.object({cursor:z.string().max(2048).optional()});const PAGE_SIZE=10;
export async function GET(request:Request,{params}:{params:Promise<{id:string}>}){
 const{id}=await params;const questionId=z.uuid().safeParse(id);const query=querySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
 if(!questionId.success||!query.success)return NextResponse.json({message:"Requête invalide."},{status:400});
 const context=await getSessionContext();if(!context.userId||context.profile?.account_status!=="active")return NextResponse.json({message:"Authentification requise."},{status:401});
 const cursor=query.data.cursor?decodeCommentCursor(query.data.cursor):null;if(query.data.cursor&&(!cursor||cursor.questionId!==questionId.data))return NextResponse.json({message:"Cette page de commentaires a expiré."},{status:400});
 const{data,error}=await createAdminClient().rpc("get_question_comments_with_upvotes",{requested_user_id:context.userId,requested_question_id:questionId.data,requested_before:cursor?.before??null,requested_before_id:cursor?.beforeId??null,requested_limit:PAGE_SIZE+1});
 if(error){logOperational("warn","comment.error",{scope:"query",code:error.code});return NextResponse.json({message:"Impossible de charger les commentaires."},{status:403})}const parsed=z.array(commentSchema).safeParse(data??[]);if(!parsed.success){logOperational("warn","comment.error",{scope:"response_invalid",count:parsed.error.issues.length});return NextResponse.json({message:"Réponse invalide."},{status:503})}
 const items=parsed.data.slice(0,PAGE_SIZE);const last=items.at(-1);const nextCursor=parsed.data.length>PAGE_SIZE&&last?encodeCommentCursor({version:1,questionId:questionId.data,before:last.created_at,beforeId:last.comment_id}):null;
 return NextResponse.json({items,nextCursor});
}

export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){
 const{id}=await params;const context=await getSessionContext();
 if(!context.userId||context.profile?.account_status!=="active")return NextResponse.json({status:"error",message:"Authentification requise."},{status:401});
 let body:unknown;try{body=await request.json()}catch{return NextResponse.json({status:"error",message:"Requête invalide."},{status:400})}
 const parsed=commentInputSchema.safeParse({questionId:id,body:typeof body==="object"&&body!==null&&"body" in body?(body as {body:unknown}).body:undefined});
 if(!parsed.success)return NextResponse.json({status:"error",message:parsed.error.issues[0]?.message??"Commentaire invalide."},{status:400});
 const{data,error}=await createAdminClient().rpc("create_comment_for_user",{requested_user_id:context.userId,requested_question_id:parsed.data.questionId,requested_body:parsed.data.body});
 if(error){logOperational("warn","comment.error",{scope:"create",code:error.code});const messages:Record<string,string>={question_unavailable:"Cette question n’est plus disponible.",contact_details:"Les liens et coordonnées ne sont pas autorisés.",forbidden_content:"Ce commentaire contient un terme interdit.",invalid_comment:"Vérifiez votre commentaire."};const key=Object.keys(messages).find((candidate)=>error.message.includes(candidate));return NextResponse.json({status:"error",message:key?messages[key]:`Publication impossible (code ${error.code||"inconnu"}).`},{status:422})}
 const created=Array.isArray(data)?data[0]:null;const comment=commentSchema.safeParse(created?{...created,upvote_count:0,is_upvoted:false}:null);if(!comment.success){logOperational("warn","comment.error",{scope:"create_response_invalid"});return NextResponse.json({status:"error",message:"La réponse du serveur est invalide."},{status:503})}
 return NextResponse.json({status:"success",message:"Commentaire publié.",comment:comment.data},{status:201});
}
