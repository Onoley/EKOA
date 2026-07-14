"use client";

import Link from "next/link";
import { useActionState } from "react";
import { requestPasswordReset, updatePassword, type AuthActionState } from "./actions";

const initialState: AuthActionState = { status: "idle", message: "" };

export function PasswordResetRequestForm() {
  const [state, action, pending] = useActionState(requestPasswordReset, initialState);
  return <form action={action} className="mt-6 space-y-4"><div><label htmlFor="reset-email" className="field-label">Adresse e-mail</label><input id="reset-email" name="email" type="email" autoComplete="email" required disabled={pending || state.status === "success"} className="field-input" placeholder="vous@exemple.fr" /></div><button className="primary-button w-full" disabled={pending || state.status === "success"}>{pending ? "Envoi…" : "Recevoir l’e-mail"}</button><Feedback state={state} /><Link href="/" className="block text-center text-sm font-semibold underline underline-offset-4">Retour à la connexion</Link></form>;
}

export function NewPasswordForm() {
  const [state, action, pending] = useActionState(updatePassword, initialState);
  return <form action={action} className="mt-6 space-y-4"><div><label htmlFor="new-password" className="field-label">Nouveau mot de passe</label><input id="new-password" name="password" type="password" autoComplete="new-password" required minLength={10} maxLength={128} disabled={pending} className="field-input" aria-describedby="new-password-help"/><p id="new-password-help" className="mt-2 text-xs text-[var(--muted)]">10 caractères minimum, avec une majuscule, une minuscule et un chiffre.</p></div><div><label htmlFor="new-password-confirmation" className="field-label">Confirmer le mot de passe</label><input id="new-password-confirmation" name="passwordConfirmation" type="password" autoComplete="new-password" required minLength={10} maxLength={128} disabled={pending} className="field-input" /></div><button className="primary-button w-full" disabled={pending}>{pending ? "Enregistrement…" : "Enregistrer le mot de passe"}</button><Feedback state={state} /></form>;
}

function Feedback({ state }: { state: AuthActionState }) {
  if (!state.message) return null;
  return <p role={state.status === "error" ? "alert" : "status"} className={state.status === "error" ? "field-error" : "text-sm text-green-800"}>{state.message}</p>;
}
