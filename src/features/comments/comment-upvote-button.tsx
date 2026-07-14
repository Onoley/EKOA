"use client";

import {useState,useTransition} from "react";
import {commentUpvoteResponseSchema} from "./schema";
import {Icon} from "@/components/ui/icon";

export function CommentUpvoteButton({commentId,initiallyUpvoted,initialCount,compact=false}:{commentId:string;initiallyUpvoted:boolean;initialCount:number;compact?:boolean}){
 const[upvoted,setUpvoted]=useState(initiallyUpvoted);const[count,setCount]=useState(initialCount);const[message,setMessage]=useState("");const[pending,startTransition]=useTransition();
 function toggle(){startTransition(async()=>{setMessage("");try{const response=await fetch(`/api/comments/${commentId}/upvote`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({enabled:!upvoted})});const payload:unknown=await response.json();const parsed=commentUpvoteResponseSchema.safeParse(payload);if(!response.ok||!parsed.success){setMessage("Impossible de modifier l’upvote.");return}setUpvoted(parsed.data.is_upvoted);setCount(parsed.data.upvote_count)}catch{setMessage("Connexion impossible.")}})}
 return <div className={compact?"comment-like":""}><button type="button" onClick={toggle} disabled={pending} className={compact?`comment-like-button ${upvoted?"comment-like-button-active":""}`:`secondary-button compact gap-2 ${upvoted?"border-[#b9c8f5] bg-[var(--accent-soft)] text-[var(--accent)]":""}`} aria-pressed={upvoted} aria-label={`${upvoted?"Retirer l’upvote du commentaire":"Upvoter le commentaire"}. ${count} upvote${count>1?"s":""}`}><span>{compact?<Icon name="heart" filled={upvoted}/>:<Icon name="arrow-up"/>}</span>{compact?null:<span>Upvote</span>}<span className="tabular-nums">{count}</span></button>{message?<p className="field-error" role="alert">{message}</p>:null}</div>;
}
