"use client";
export default function QuestionError({ reset }: { error: Error; reset: () => void }) { return <main className="p-5"><div role="alert" className="error-state"><p className="font-bold">Impossible de charger cette question.</p><button type="button" onClick={reset} className="secondary-button mt-4">Réessayer</button></div></main>; }
