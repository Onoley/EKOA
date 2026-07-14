import Link from "next/link";
import type { DiscoveryResult } from "./schema";

const dateFormatter=new Intl.DateTimeFormat("fr-FR",{dateStyle:"medium"});
export function DiscoveryQuestionList({items,emptyMessage}:{items:DiscoveryResult[];emptyMessage:string}){
  if(!items.length) return <div className="empty-state">{emptyMessage}</div>;
  return <ul className="discovery-list">{items.map((item)=><li key={item.question_id}><Link href={`/questions/${item.question_id}`} className="discovery-item">{item.sponsored_by?<p className="discovery-sponsored">Sponsorisé par {item.sponsored_by}</p>:null}<div className="flex min-w-0 flex-1 flex-col"><div className="flex flex-wrap items-center gap-2"><span className="discovery-category">{item.category_name}</span>{item.tags.slice(0,2).map((tag)=><span key={tag} className="text-[.68rem] text-[var(--muted)]">#{tag}</span>)}</div><h3>{item.question_text}</h3><p>@{item.author_username}{item.author_verified?" · ✓":""} · {dateFormatter.format(new Date(item.published_at))}</p></div><span className="discovery-chevron" aria-hidden="true">›</span></Link></li>)}</ul>;
}
