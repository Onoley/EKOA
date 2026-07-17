"use client";

import { useActionState, useRef, useState } from "react";
import { saveOrPublishQuestion, type QuestionActionState } from "./actions";
import { OPTION_MAX_LENGTH, QUESTION_MAX_LENGTH } from "./schema";

type Category = { id: string; name: string; universeName: string };
type ControlledTag = { name: string; slug: string };

export type QuestionInitial = {
  id?: string;
  previousWaveId?: string;
  text?: string;
  categoryId?: string;
  options?: string[];
  tags?: string[];
  minAge?: number | null;
  maxAge?: number | null;
};

const initialState: QuestionActionState = { status: "idle", message: "" };
const STEP_COUNT = 4;

export function QuestionForm({
  categories,
  tagsByCategory,
  initial = {},
}: {
  categories: Category[];
  tagsByCategory: Record<string, ControlledTag[]>;
  initial?: QuestionInitial;
}) {
  const [step, setStep] = useState(1);
  const [optionCount, setOptionCount] = useState(
    Math.max(2, initial.options?.length ?? 2),
  );
  const [categoryId, setCategoryId] = useState(initial.categoryId ?? "");
  const [state, action, pending] = useActionState(
    saveOrPublishQuestion,
    initialState,
  );
  const formRef = useRef<HTMLFormElement>(null);

  const fieldError = (name: string) => state.fieldErrors?.[name]?.[0];
  const continueToNextStep = () => {
    const current = formRef.current?.querySelector("fieldset:not(.hidden)");
    if (current instanceof HTMLFieldSetElement && !current.checkValidity()) {
      formRef.current?.reportValidity();
      return;
    }
    setStep((value) => Math.min(STEP_COUNT, value + 1));
  };

  return (
    <form ref={formRef} action={action} className="question-form space-y-6">
      <input
        type="hidden"
        name="questionId"
        value={state.draftId ?? initial.id ?? ""}
      />
      <input
        type="hidden"
        name="previousWaveId"
        value={initial.previousWaveId ?? ""}
      />

      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-[var(--muted)]">
          Étape {step} sur {STEP_COUNT}
        </p>
        <p aria-live="polite" className="text-sm text-[var(--muted)]">
          {state.status === "draft" ? state.message : ""}
        </p>
      </div>
      <div className="h-1.5 rounded-full bg-[var(--border)]">
        <div
          className="h-full rounded-full bg-[var(--accent)] transition-all"
          style={{ width: `${(step / STEP_COUNT) * 100}%` }}
        />
      </div>

      <fieldset
        className={step === 1 ? "space-y-4" : "hidden"}
        disabled={pending}
      >
        <legend className="text-2xl font-bold">Votre question</legend>
        <label htmlFor="text" className="field-label">
          Question concise
        </label>
        <textarea
          id="text"
          name="text"
          required
          minLength={10}
          maxLength={QUESTION_MAX_LENGTH}
          rows={5}
          defaultValue={initial.text}
          className="field-input min-h-32 py-3"
          aria-describedby="text-help text-error"
        />
        <div id="text-help" className="text-sm text-[var(--muted)]">
          10 à {QUESTION_MAX_LENGTH} caractères.
        </div>
        {fieldError("text") ? (
          <p id="text-error" className="field-error">
            {fieldError("text")}
          </p>
        ) : null}
      </fieldset>

      <fieldset
        className={step === 2 ? "space-y-4" : "hidden"}
        disabled={pending}
      >
        <legend className="text-2xl font-bold">Réponses proposées</legend>
        <p className="body-copy text-sm">
          Ajoutez entre deux et six réponses différentes.
        </p>
        {Array.from({ length: optionCount }, (_, index) => (
          <div key={index}>
            <label className="field-label" htmlFor={`option${index + 1}`}>
              Réponse {index + 1}
            </label>
            <input
              className="field-input"
              id={`option${index + 1}`}
              name={`option${index + 1}`}
              required={index < 2}
              maxLength={OPTION_MAX_LENGTH}
              defaultValue={initial.options?.[index]}
            />
          </div>
        ))}
        {fieldError("options") ? (
          <p className="field-error">{fieldError("options")}</p>
        ) : null}
        <div className="flex gap-2">
          {optionCount < 6 ? (
            <button
              type="button"
              className="secondary-button compact"
              onClick={() => setOptionCount((value) => value + 1)}
            >
              Ajouter une réponse
            </button>
          ) : null}
          {optionCount > 2 ? (
            <button
              type="button"
              className="secondary-button compact"
              onClick={() => setOptionCount((value) => value - 1)}
            >
              Retirer la dernière
            </button>
          ) : null}
        </div>
      </fieldset>

      <fieldset
        className={step === 3 ? "space-y-5" : "hidden"}
        disabled={pending}
      >
        <legend className="text-2xl font-bold">Classement et public</legend>
        <div>
          <label htmlFor="categoryId" className="field-label">
            Catégorie principale
          </label>
          <select
            id="categoryId"
            name="categoryId"
            required
            value={categoryId}
            onChange={(event) => setCategoryId(event.target.value)}
            className="field-input"
          >
            <option value="" disabled>
              Sélectionner
            </option>
            {Object.entries(
              Object.groupBy(categories, (category) => category.universeName),
            ).map(([universe, items]) => (
              <optgroup key={universe} label={universe}>
                {items?.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
          {fieldError("categoryId") ? (
            <p className="field-error">{fieldError("categoryId")}</p>
          ) : null}
        </div>

        <fieldset className="space-y-3 border-0 p-0">
          <legend className="field-label">Tags facultatifs</legend>
          {categoryId ? (
            <div className="flex flex-wrap gap-2">
              {(tagsByCategory[categoryId] ?? []).map((tag) => (
                <label
                  key={tag.slug}
                  className="cursor-pointer rounded-full border border-[var(--border)] px-3 py-2 text-sm has-[:checked]:border-[#b9c8f5] has-[:checked]:bg-[var(--accent-soft)] has-[:checked]:text-[var(--accent)]"
                >
                  <input
                    type="checkbox"
                    name="tags"
                    value={tag.name}
                    defaultChecked={initial.tags?.some(
                      (value) => value.toLowerCase() === tag.name.toLowerCase(),
                    )}
                    className="sr-only"
                  />
                  {tag.name}
                </label>
              ))}
            </div>
          ) : (
            <p className="text-sm text-[var(--muted)]">
              Sélectionnez d’abord une catégorie.
            </p>
          )}
          <p className="text-sm text-[var(--muted)]">
            Choisissez au maximum trois tags recommandés.
          </p>
          {fieldError("tags") ? (
            <p className="field-error">{fieldError("tags")}</p>
          ) : null}
        </fieldset>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="field-label" htmlFor="minAge">
              Âge minimum
            </label>
            <input
              className="field-input"
              id="minAge"
              name="minAge"
              type="number"
              min="18"
              max="120"
              defaultValue={initial.minAge ?? ""}
            />
          </div>
          <div>
            <label className="field-label" htmlFor="maxAge">
              Âge maximum
            </label>
            <input
              className="field-input"
              id="maxAge"
              name="maxAge"
              type="number"
              min="18"
              max="120"
              defaultValue={initial.maxAge ?? ""}
            />
          </div>
        </div>
        {fieldError("maxAge") ? (
          <p className="field-error">{fieldError("maxAge")}</p>
        ) : null}
      </fieldset>

      <section
        className={step === 4 ? "space-y-4" : "hidden"}
        aria-labelledby="preview-title"
      >
        <h2 id="preview-title" className="text-2xl font-bold">
          Publication
        </h2>
        <div className="rounded-3xl border border-black/10 bg-white p-5">
          <p className="eyebrow">Question Ekoa</p>
          <p className="mt-5 font-semibold">
            Votre question sera publiée immédiatement.
          </p>
          <p className="body-copy mt-3 text-sm">
            Elle n’apparaîtra dans le tableau de bord administrateur qu’après
            trois signalements distincts. Elle restera en ligne jusqu’à une
            décision manuelle.
          </p>
        </div>
      </section>

      {state.status === "error" ? (
        <div role="alert" className="error-state">
          {state.message}
        </div>
      ) : null}

      <div className="form-navigation flex flex-wrap gap-3">
        {step > 1 ? (
          <button
            type="button"
            className="secondary-button flex-1"
            onClick={() => setStep((value) => Math.max(1, value - 1))}
          >
            Retour
          </button>
        ) : null}
        {step < STEP_COUNT ? (
          <button
            type="button"
            className="primary-button flex-1"
            onClick={continueToNextStep}
          >
            Continuer
          </button>
        ) : (
          <>
            <button
              type="submit"
              name="intent"
              value="draft"
              className="secondary-button flex-1"
              disabled={pending}
            >
              Enregistrer
            </button>
            <button
              type="submit"
              name="intent"
              value="publish"
              className="primary-button flex-1"
              disabled={pending}
            >
              {pending ? "Publication…" : "Publier maintenant"}
            </button>
          </>
        )}
      </div>
    </form>
  );
}
