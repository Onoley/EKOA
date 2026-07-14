"use client";

import Link from "next/link";
import {usePathname} from "next/navigation";
import {BrandLogo} from "@/components/ui/brand-logo";

const tabs = [
  { href: "/fil", label: "Accueil", icon: "home" },
  { href: "/explorer", label: "Explorer", icon: "search" },
  { href: "/creer", label: "Créer", icon: "create" },
  { href: "/profil", label: "Profil", icon: "profile" },
] as const;

function TabIcon({name}:{name:(typeof tabs)[number]["icon"]}){
 if(name==="home")return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 10.8 12 3l9 7.8v9.7a.5.5 0 0 1-.5.5H15v-6H9v6H3.5a.5.5 0 0 1-.5-.5Z"/></svg>;
 if(name==="search")return <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.8" cy="10.8" r="6.8"/><path d="m16 16 5 5"/></svg>;
 if(name==="create")return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>;
 return <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4.5 21c.7-4.2 3.2-6.3 7.5-6.3s6.8 2.1 7.5 6.3"/></svg>;
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname=usePathname();const immersive=pathname==="/fil"||pathname.startsWith("/questions/");
  const centeredLogo=pathname.startsWith("/explorer")||pathname.startsWith("/creer")||pathname.startsWith("/profil");
  return (
    <div className="app-shell mx-auto min-h-dvh w-full max-w-2xl border-x border-[var(--border)] pb-20">
      {!immersive?<header className={`sticky top-0 z-30 flex min-h-16 items-center border-b px-5 ${centeredLogo?"justify-center":""}`}>
        <Link href="/fil" aria-label="Ekoa, accueil"><BrandLogo className="h-auto w-[5.75rem]" priority /></Link>
      </header>:null}
      {children}
      <nav aria-label="Navigation principale" className="app-nav fixed inset-x-0 bottom-0 z-40 mx-auto flex w-full max-w-2xl justify-around border-t px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-1.5">
        {tabs.map((tab) => {const active=pathname===tab.href||pathname.startsWith(`${tab.href}/`);return <Link key={tab.href} href={tab.href} aria-current={active?"page":undefined} className={`flex min-h-13 min-w-16 flex-col items-center justify-center rounded-xl text-[0.68rem] font-semibold outline-none focus-visible:ring-3 focus-visible:ring-[#b9c8f5] ${active?"text-[var(--accent)]":"text-[var(--muted)]"}`}><span className={`tab-icon ${tab.icon==="create"?"tab-icon-create":""}`}><TabIcon name={tab.icon}/></span>{tab.label}</Link>})}
      </nav>
    </div>
  );
}
