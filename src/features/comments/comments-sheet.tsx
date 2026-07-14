"use client";

import {useEffect,useRef} from "react";
import {CommentsSection} from "./comments-section";
import {Icon} from "@/components/ui/icon";

export function CommentsSheet({questionId}:{questionId:string}){
 const dialogRef=useRef<HTMLDialogElement>(null);const triggerRef=useRef<HTMLButtonElement>(null);
 function open(){dialogRef.current?.showModal()}
 function close(){dialogRef.current?.close()}
 useEffect(()=>{const dialog=dialogRef.current;if(!dialog)return;const restoreFocus=()=>triggerRef.current?.focus();dialog.addEventListener("close",restoreFocus);return()=>dialog.removeEventListener("close",restoreFocus)},[]);
 return <>
  <button ref={triggerRef} type="button" onClick={open} className="feed-rail-button" aria-haspopup="dialog" aria-controls={`comments-sheet-${questionId}`}><span><Icon name="comment" /></span><span>Commentaires</span></button>
  <dialog ref={dialogRef} id={`comments-sheet-${questionId}`} className="comments-sheet" aria-labelledby={`comments-sheet-title-${questionId}`}>
   <div className="comments-sheet-handle" aria-hidden="true"/>
   <header className="comments-sheet-header"><h2 id={`comments-sheet-title-${questionId}`}>Commentaires</h2><button type="button" onClick={close} className="comments-sheet-close" aria-label="Fermer les commentaires">×</button></header>
   <div className="comments-sheet-content"><CommentsSection questionId={questionId} hideHeading compactComposer/></div>
  </dialog>
 </>;
}
