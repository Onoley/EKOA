"use client";

import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { createClient } from "@/lib/supabase/client";
import { getAvatarUrl } from "./avatar";

const acceptedTypes = new Set(["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"]);
const maxFileSize = 10 * 1024 * 1024;
const avatarSize = 768;

async function cropAvatar(file: File, positionX: number, positionY: number, zoom: number) {
  const bitmap = await createImageBitmap(file);
  const baseScale = Math.max(avatarSize / bitmap.width, avatarSize / bitmap.height);
  const scale = baseScale * zoom;
  const renderedWidth = bitmap.width * scale;
  const renderedHeight = bitmap.height * scale;
  const overflowX = Math.max(0, renderedWidth - avatarSize);
  const overflowY = Math.max(0, renderedHeight - avatarSize);
  const destinationX = -(overflowX * positionX) / 100;
  const destinationY = -(overflowY * positionY) / 100;
  const canvas = document.createElement("canvas");
  canvas.width = avatarSize;
  canvas.height = avatarSize;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("canvas_unavailable");
  context.drawImage(bitmap, destinationX, destinationY, renderedWidth, renderedHeight);
  bitmap.close();
  const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((result) => result ? resolve(result) : reject(new Error("avatar_conversion_failed")), "image/jpeg", .9));
  return new File([blob], "avatar.jpg", { type: "image/jpeg" });
}

export function AvatarForm({ userId, username, supabaseUrl }: { userId: string; username: string; supabaseUrl: string }) {
  const libraryInput = useRef<HTMLInputElement>(null);
  const cameraInput = useRef<HTMLInputElement>(null);
  const [version, setVersion] = useState(() => Date.now());
  const [hasImage, setHasImage] = useState(true);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [positionX, setPositionX] = useState(50);
  const [positionY, setPositionY] = useState(50);
  const [zoom, setZoom] = useState(1);

  useEffect(() => () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  async function upload() {
    if (!selectedFile) return;
    setMessage("");
    setError(false);

    setPending(true);
    try {
      const file = await cropAvatar(selectedFile, positionX, positionY, zoom);
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
      setSelectedFile(null);
      setPreviewUrl(null);
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
    if (!file) return;
    setMessage("");
    setError(false);
    if (!acceptedTypes.has(file.type)) {
      setError(true);
      setMessage("Choisissez une image JPEG, PNG, WebP, HEIC ou HEIF.");
      return;
    }
    if (file.size > maxFileSize) {
      setError(true);
      setMessage("La photo ne doit pas dépasser 10 Mo.");
      return;
    }
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setSelectedFile(file);
    setPreviewUrl(URL.createObjectURL(file));
    setPositionX(50);
    setPositionY(50);
    setZoom(1);
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
    {previewUrl ? <div className="avatar-cropper mt-5">
      <h3 className="font-bold">Ajuster la photo</h3>
      <div className="avatar-crop-preview mt-4" aria-label="Aperçu de la photo de profil">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={previewUrl} alt="" style={{ objectPosition: `${positionX}% ${positionY}%`, transform: `scale(${zoom})` }} />
      </div>
      <div className="mt-4 space-y-3">
        <label className="block text-sm font-semibold">Position horizontale<input className="avatar-range" type="range" min="0" max="100" value={positionX} onChange={(event) => setPositionX(Number(event.target.value))}/></label>
        <label className="block text-sm font-semibold">Position verticale<input className="avatar-range" type="range" min="0" max="100" value={positionY} onChange={(event) => setPositionY(Number(event.target.value))}/></label>
        <label className="block text-sm font-semibold">Zoom<input className="avatar-range" type="range" min="1" max="2" step=".05" value={zoom} onChange={(event) => setZoom(Number(event.target.value))}/></label>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2">
        <button type="button" className="secondary-button" disabled={pending} onClick={() => { setSelectedFile(null); setPreviewUrl(null); }}>Annuler</button>
        <button type="button" className="primary-button" disabled={pending} onClick={() => void upload()}>{pending ? "Enregistrement…" : "Enregistrer"}</button>
      </div>
    </div> : null}
    <input ref={libraryInput} type="file" accept="image/*" className="sr-only" onChange={selectFile} />
    <input ref={cameraInput} type="file" accept="image/*" capture="user" className="sr-only" onChange={selectFile} />
    <div className={`mt-4 grid gap-2 ${previewUrl ? "hidden" : ""}`}>
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
