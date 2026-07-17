"use client";

import { useActionState } from "react";
import { resubmitQuestionRevision, type ModerationState } from "./actions";

const initialState = { status: "idle", message: "" } satisfies ModerationState;

export function QuestionRevisionForm({
  questionId,
  text,
  options,
}: {
  questionId: string;
  text: string;
  options: string[];
}) {
  const [state, action, pending] = useActionState(resubmitQuestionRevision, initialState);

  return <form action={action} className="mt-5 space-y-4">
    <input type="hidden" name="questionId" value={questionId} />
    <label className="field-label">
      Votre question
      <textarea className="field-input mt-2 min-h-28 py-3" name="text" defaultValue={text} required minLength={10} maxLength={180} />
    </label>
    <fieldset className="space-y-3">
      <legend className="font-bold">Réponses proposées</legend>
      {options.map((option, index) => <label className="field-label" key={index}>
        Réponse {index + 1}
        <input className="field-input mt-2" name="options" defaultValue={option} required maxLength={80} />
      </label>)}
    </fieldset>
    <button className="primary-button w-full" disabled={pending}>{pending ? "Renvoi en cours…" : "Renvoyer ma question"}</button>
    {state.message ? <p className={state.status === "error" ? "field-error" : "text-sm font-semibold text-green-800"} role={state.status === "error" ? "alert" : "status"}>{state.message}</p> : null}
  </form>;
}
