"use client";
export default function ExplorerError({reset}:{error:Error;reset:()=>void}){return <main className="p-5"><div role="alert" className="error-state"><h1 className="text-xl font-bold">Explorer est indisponible</h1><p className="mt-2">Une erreur inattendue est survenue.</p><button className="primary-button mt-5" onClick={reset}>Réessayer</button></div></main>}
