"use client";

import { useActionState } from "react";
import { requestMagicLink, type AuthActionState } from "./actions";

const initialState: AuthActionState = { status: "idle", message: "" };

export function SignInForm() {
  const [state, action, pending] = useActionState(requestMagicLink, initialState);

  return (
    <form action={action} className="mt-8 space-y-4">
      <div>
        <label htmlFor="email" className="mb-2 block text-sm font-semibold">
          Adresse e-mail
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          disabled={pending || state.status === "success"}
          className="field-input"
          placeholder="vous@exemple.fr"
        />
      </div>
      <button
        type="submit"
        disabled={pending || state.status === "success"}
        className="primary-button w-full"
      >
        {pending ? "Envoi en cours…" : "Recevoir un lien de connexion"}
      </button>
      {state.message ? (
        <p
          role={state.status === "error" ? "alert" : "status"}
          className={state.status === "error" ? "text-sm text-red-700" : "text-sm text-green-800"}
        >
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
