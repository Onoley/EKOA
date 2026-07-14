"use client";

import { useActionState, useRef, useState } from "react";
import { completeOnboarding, type OnboardingState } from "./actions";
import { genderValues, professionalActivities } from "./schema";

type Category = { id: string; name: string; description: string; universeName: string; universeOrder: number };
const initialState: OnboardingState = { status: "idle", message: "" };

export function OnboardingForm({ categories }: { categories: Category[] }) {
  const [step, setStep] = useState(1);
  const [clientError, setClientError] = useState("");
  const formRef = useRef<HTMLFormElement>(null);
  const [state, action, pending] = useActionState(completeOnboarding, initialState);

  const validateStep = (targetStep: number) => {
    const fieldset = formRef.current?.querySelectorAll("fieldset")[targetStep - 1];
    if (!fieldset) return false;
    const invalid = fieldset.querySelector<HTMLInputElement | HTMLSelectElement>(":invalid");
    if (invalid) {
      setClientError("Complétez le champ indiqué avant de continuer.");
      invalid.focus();
      return false;
    }
    if (targetStep === 3 && fieldset.querySelectorAll<HTMLInputElement>('input[name="categoryIds"]:checked').length < 3) {
      setClientError("Choisissez au moins trois catégories.");
      return false;
    }
    setClientError("");
    return true;
  };

  return (
    <form ref={formRef} action={action} noValidate className="space-y-6" onSubmit={(event) => {
      for (let targetStep = 1; targetStep <= 3; targetStep += 1) {
        if (!validateStep(targetStep)) { event.preventDefault(); setStep(targetStep); return; }
      }
    }}>
      <p className="text-sm font-semibold text-[var(--muted)]">Étape {step} sur 3</p>
      <div className="h-1.5 overflow-hidden rounded-full bg-[var(--border)]" aria-hidden="true">
        <div className="h-full bg-[var(--accent)] transition-all" style={{ width: `${step * 33.34}%` }} />
      </div>

      <fieldset className={step === 1 ? "space-y-5" : "hidden"} disabled={pending}>
        <legend className="text-2xl font-bold">Votre profil privé</legend>
        <Field label="Nom d’utilisateur public" name="username" autoComplete="username" placeholder="exemple_75" error={state.fieldErrors?.username?.[0]} />
        <Field label="Année de naissance" name="birthYear" type="number" inputMode="numeric" min={String(new Date().getFullYear() - 120)} max={String(new Date().getFullYear() - 18)} error={state.fieldErrors?.birthYear?.[0]} />
        <Field label="Département de résidence" name="departmentCode" autoComplete="address-level1" placeholder="75, 2A, 971…" error={state.fieldErrors?.departmentCode?.[0]} />
      </fieldset>

      <fieldset className={step === 2 ? "space-y-5" : "hidden"} disabled={pending}>
        <legend className="text-2xl font-bold">Quelques repères privés</legend>
        <Select label="Activité professionnelle" name="professionalActivity" options={professionalActivities} error={state.fieldErrors?.professionalActivity?.[0]} />
        <Select label="Genre (facultatif)" name="gender" options={genderValues} required={false} error={state.fieldErrors?.gender?.[0]} />
        <p className="body-copy text-sm">Ces informations ne seront pas affichées publiquement.</p>
      </fieldset>

      <fieldset className={step === 3 ? "space-y-4" : "hidden"} disabled={pending}>
        <legend className="text-2xl font-bold">Vos sujets</legend>
        <p className="body-copy">Choisissez au moins trois catégories.</p>
        <div className="space-y-5">
          {Object.entries(Object.groupBy(categories,(category)=>category.universeName)).map(([universe,items])=><section key={universe} aria-labelledby={`universe-${items?.[0]?.universeOrder}`}><h3 id={`universe-${items?.[0]?.universeOrder}`} className="mb-2 font-bold">{universe}</h3><div className="grid gap-2">{items?.map((category) => (
            <label key={category.id} className="flex cursor-pointer gap-3 rounded-2xl border border-black/15 p-4 has-[:checked]:border-black has-[:checked]:bg-[var(--accent-soft)]">
              <input type="checkbox" name="categoryIds" value={category.id} className="mt-1 size-5 accent-black" />
              <span><span className="block font-semibold">{category.name}</span><span className="text-sm text-[var(--muted)]">{category.description}</span></span>
            </label>
          ))}</div></section>)}
        </div>
        {state.fieldErrors?.categoryIds?.[0] ? <p className="field-error">{state.fieldErrors.categoryIds[0]}</p> : null}
      </fieldset>

      {clientError ? <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-800">{clientError}</p> : null}
      {state.message ? <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-800">{state.message}</p> : null}
      <div className="flex gap-3">
        {step > 1 ? <button type="button" className="secondary-button flex-1" onClick={() => setStep(step - 1)}>Retour</button> : null}
        {step < 3 ? <button type="button" className="primary-button flex-1" onClick={() => { if (validateStep(step)) setStep(step + 1); }}>Continuer</button> : <button type="submit" disabled={pending} className="primary-button flex-1 disabled:opacity-60">{pending ? "Création…" : "Terminer"}</button>}
      </div>
    </form>
  );
}

type FieldProps = React.InputHTMLAttributes<HTMLInputElement> & { label: string; name: string; error?: string };
function Field({ label, name, error, ...props }: FieldProps) {
  return <div><label htmlFor={name} className="field-label">{label}</label><input id={name} name={name} required className="field-input" aria-invalid={Boolean(error)} aria-describedby={error ? `${name}-error` : undefined} {...props} />{error ? <p id={`${name}-error`} className="field-error">{error}</p> : null}</div>;
}

function Select({ label, name, options, error, required = true }: { label: string; name: string; options: readonly (readonly [string, string])[]; error?: string; required?: boolean }) {
  return <div><label htmlFor={name} className="field-label">{label}</label><select id={name} name={name} required={required} defaultValue="" className="field-input"><option value="">{required ? "Sélectionner" : "Ne pas répondre"}</option>{options.map(([value, text]) => <option key={value} value={value}>{text}</option>)}</select>{error ? <p className="field-error">{error}</p> : null}</div>;
}
