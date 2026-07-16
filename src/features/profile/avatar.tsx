"use client";

import { useState } from "react";

const avatarBucket = "profile-avatars";

export function getAvatarUrl(supabaseUrl: string, userId: string, version?: number) {
  const base = `${supabaseUrl}/storage/v1/object/public/${avatarBucket}/${userId}/avatar`;
  return version === undefined ? base : `${base}?v=${version}`;
}

export function ProfileAvatar({
  userId,
  username,
  supabaseUrl,
  className,
  verified = false,
}: {
  userId: string;
  username: string;
  supabaseUrl: string;
  className: string;
  verified?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  const [version] = useState(() => Date.now());
  const initial = username === "membre supprimé" ? "?" : username.slice(0, 1).toLocaleUpperCase("fr");

  return <span className={className}>
    {!failed ? (
      // The public Supabase host is configured at runtime, so next/image cannot whitelist it statically.
      // eslint-disable-next-line @next/next/no-img-element
      <img src={getAvatarUrl(supabaseUrl, userId, version)} alt="" className="profile-avatar-image" onError={() => setFailed(true)} />
    ) : <span aria-hidden="true">{initial}</span>}
    {verified ? <span className="feed-author-badge" aria-label="Profil vérifié">✓</span> : null}
  </span>;
}
