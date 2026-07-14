"use server";
import {requireActiveProfile} from "@/features/auth/authorization";
import {commentInputSchema,commentSchema,type CommentRow} from "./schema";
import {createAdminClient} from "@/lib/supabase/admin";
import {logOperational} from "@/lib/observability/logger";
export type CommentActionState={status:"success"|"error";message:string;comment?:CommentRow};
const errors:Record<string,string>={question_unavailable:"Cette question n’est plus disponible.",contact_details:"Les liens et coordonnées ne sont pas autorisés.",forbidden_content:"Ce commentaire contient un terme interdit.",invalid_comment:"Vérifiez votre commentaire."};
export async function createComment(formData:FormData):Promise<CommentActionState>{
  const parsed=commentInputSchema.safeParse({questionId:formData.get("questionId"),body:formData.get("body")});
  if(!parsed.success)return{status:"error",message:parsed.error.issues[0]?.message??"Commentaire invalide."};
  const{userId}=await requireActiveProfile();const{data,error}=await createAdminClient().rpc("create_comment_for_user",{requested_user_id:userId,requested_question_id:parsed.data.questionId,requested_body:parsed.data.body});
  if(error){logOperational("warn","event.error",{scope:"comment",code:error.code||"database_rejected"});const key=Object.keys(errors).find((candidate)=>error.message.includes(candidate));return{status:"error",message:key?errors[key]:"Le commentaire n’a pas pu être publié."}}
  const row=commentSchema.safeParse(Array.isArray(data)?data[0]:null);if(!row.success)return{status:"error",message:"La réponse du serveur est invalide."};
  return{status:"success",message:"Commentaire publié.",comment:row.data};
}
