"use client";

import { useRef, useState, type ChangeEvent } from "react";
import { createClient } from "@/lib/supabase/client";
import { getAvatarUrl } from "./avatar";

const acceptedTypes = new Set(["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"]);
const maxFileSize = 10 * 1024 * 1024;

export function AvatarForm({ userId, username, supabaseUrl }: { userId: string; username: string; supabaseUrl: string }) {
  const libraryInput = useRef<HTMLInputElement>(null);
  const cameraInput = useRef<HTMLInputElement>(null);
  const [version, setVersion] = useState(() => Date.now());
  const [hasImage, setHasImage] = useState(true);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState(false);

  async function upload(file: File) {
    setMessage("");
    setError(false);
    if (!acceptedTypes.has(file.type)) {
      setError(true);
      setMessage("Choisissez une image JPEG, PNG ou WebP.");
      return;
    }
    if (file.size > maxFileSize) {
      setError(true);
      setMessage("La photo ne doit pas dépasser 5 Mo.");
      return;
    }

    setPending(true);
    try {
      const supabase = createClient();
      const { error: uploadError } = await supabase.storage.from("profile-avatars").upload(`${userId}/avatar`, file, {
        cacheControl: "0",
        contentType: file.type,
        upsert: true,
      });
      if (uploadError) throw uploadError;
      const { data: verification, error: verificationError } = await supabase.storage.from("profile-avatars").download(`${userId}/avatar`);
      if (verificationError || verification.size === 0) throw verificationError ?? new Error("empty_avatar");
      setHasImage(true);
      setVersion(Date.now());
      setMessage("Photo de profil mise à jour.");
    } catch (uploadError) {
      console.warn("profile.avatar_upload_failed", {
        code: uploadError instanceof Error ? uploadError.name : "unknown",
      });
      setError(true);
      setMessage("La photo n’a pas pu être enregistrée. Vérifiez son format et réessayez.");
    } finally {
      setPending(false);
    }
  }

  function selectFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file) void upload(file);
  }

  async function remove() {
    setPending(true);
    setMessage("");
    setError(false);
    try {
      const supabase = createClient();
      const { error: removeError } = await supabase.storage.from("profile-avatars").remove([`${userId}/avatar`]);
      if (removeError) throw removeError;
      setHasImage(false);
      setMessage("Photo de profil supprimée.");
    } catch {
      setError(true);
      setMessage("La photo n’a pas pu être supprimée.");
    } finally {
      setPending(false);
    }
  }

  return <section className="mt-6 rounded-3xl border border-[var(--border)] p-5" aria-labelledby="avatar-title">
    <h2 id="avatar-title" className="text-xl font-bold">Photo de profil</h2>
    <div className="mt-4 flex items-center gap-4">
      <span className="profile-settings-avatar">
        {hasImage ? (
          // The public Supabase host is configured at runtime, so next/image cannot whitelist it statically.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={getAvatarUrl(supabaseUrl, userId, version)} alt={`Photo de profil de ${username}`} onError={() => setHasImage(false)} />
        ) : <span aria-hidden="true">{username.slice(0, 1).toLocaleUpperCase("fr")}</span>}
      </span>
      <p className="text-sm leading-5 text-[var(--muted)]">JPEG, PNG, WebP ou photo iPhone. 10 Mo maximum.</p>
    </div>
    <input ref={libraryInput} type="file" accept="image/*" className="sr-only" onChange={selectFile} />
    <input ref={cameraInput} type="file" accept="image/*" capture="user" className="sr-only" onChange={selectFile} />
    <div className="mt-4 grid gap-2">
      <button type="button" className="primary-button w-full" disabled={pending} onClick={() => libraryInput.current?.click()}>
        {pending ? "Enregistrement…" : "Choisir dans la photothèque"}
      </button>
      <button type="button" className="secondary-button w-full" disabled={pending} onClick={() => cameraInput.current?.click()}>
        Prendre une photo
      </button>
      {hasImage ? <button type="button" className="min-h-11 text-sm font-semibold text-[var(--danger)]" disabled={pending} onClick={() => void remove()}>Supprimer la photo</button> : null}
    </div>
    {message ? <p className={error ? "field-error" : "mt-3 text-sm text-green-800"} role={error ? "alert" : "status"}>{message}</p> : null}
  </section>;
}
