"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { signIn, signUp, type AuthActionState } from "./actions";

const initialState: AuthActionState = { status: "idle", message: "" };

function Feedback({ state }: { state: AuthActionState }) {
  if (!state.message) return null;
  return (
    <p
      role={state.status === "error" ? "alert" : "status"}
      className={state.status === "error" ? "field-error" : "text-sm text-green-800"}
    >
      {state.message}
    </p>
  );
}

export function SignInForm() {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [signInState, signInAction, signInPending] = useActionState(signIn, initialState);
  const [signUpState, signUpAction, signUpPending] = useActionState(signUp, initialState);
  const signingUp = mode === "signup";

  return (
    <div className="mt-8">
      <div className="grid grid-cols-2 rounded-2xl bg-[var(--background)] p-1" role="tablist" aria-label="Accès au compte">
        <button type="button" role="tab" aria-selected={!signingUp} onClick={() => setMode("signin")} className={`min-h-11 rounded-xl text-sm font-semibold ${!signingUp ? "bg-white shadow-sm" : "text-[var(--muted)]"}`}>Connexion</button>
        <button type="button" role="tab" aria-selected={signingUp} onClick={() => setMode("signup")} className={`min-h-11 rounded-xl text-sm font-semibold ${signingUp ? "bg-white shadow-sm" : "text-[var(--muted)]"}`}>Créer un compte</button>
      </div>

      {signingUp ? (
        <form action={signUpAction} className="mt-5 space-y-4">
          <EmailField disabled={signUpPending || signUpState.status === "success"} autoComplete="email" />
          <PasswordField id="signup-password" label="Mot de passe" name="password" autoComplete="new-password" disabled={signUpPending || signUpState.status === "success"} describedBy="password-help" />
          <p id="password-help" className="text-xs text-[var(--muted)]">10 caractères minimum, avec une majuscule, une minuscule et un chiffre.</p>
          <PasswordField id="signup-password-confirmation" label="Confirmer le mot de passe" name="passwordConfirmation" autoComplete="new-password" disabled={signUpPending || signUpState.status === "success"} />
          <button type="submit" disabled={signUpPending || signUpState.status === "success"} className="primary-button w-full">{signUpPending ? "Création…" : "Créer mon compte"}</button>
          <Feedback state={signUpState} />
        </form>
      ) : (
        <form action={signInAction} className="mt-5 space-y-4">
          <EmailField disabled={signInPending} autoComplete="email" />
          <PasswordField id="signin-password" label="Mot de passe" name="password" autoComplete="current-password" disabled={signInPending} />
          <div className="text-right"><Link href="/mot-de-passe/oublie" className="text-sm font-semibold underline underline-offset-4">Mot de passe oublié ?</Link></div>
          <button type="submit" disabled={signInPending} className="primary-button w-full">{signInPending ? "Connexion…" : "Se connecter"}</button>
          <Feedback state={signInState} />
        </form>
      )}
    </div>
  );
}

function EmailField({ disabled, autoComplete }: { disabled: boolean; autoComplete: string }) {
  return <div><label htmlFor="email" className="field-label">Adresse e-mail</label><input id="email" name="email" type="email" autoComplete={autoComplete} required disabled={disabled} className="field-input" placeholder="vous@exemple.fr" /></div>;
}

function PasswordField({ id, label, name, autoComplete, disabled, describedBy }: { id: string; label: string; name: string; autoComplete: string; disabled: boolean; describedBy?: string }) {
  return <div><label htmlFor={id} className="field-label">{label}</label><input id={id} name={name} type="password" autoComplete={autoComplete} required minLength={10} maxLength={128} disabled={disabled} aria-describedby={describedBy} className="field-input" /></div>;
}
