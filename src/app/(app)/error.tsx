"use client";

export default function AppError({ reset }: { error: Error; reset: () => void }) {
  return <main className="p-5"><div role="alert" className="error-state"><h1 className="font-bold">Une erreur est survenue</h1><p className="mt-2 text-sm">La page n’a pas pu être chargée.</p><button type="button" onClick={reset} className="secondary-button mt-4">Réessayer</button></div></main>;
}
