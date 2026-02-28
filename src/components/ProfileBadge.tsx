"use client";

import { useState, useEffect } from "react";
import { fetchProfile, formatPubkey, type NostrProfile } from "@/lib/nostr/profile";

interface Props {
  pubkey: string;
  isYou?: boolean;
  size?: "sm" | "md";
}

export default function ProfileBadge({ pubkey, isYou, size = "sm" }: Props) {
  const [profile, setProfile] = useState<NostrProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { getNDK } = await import("@/lib/nostr/ndk");
        const ndk = await getNDK();
        const p = await fetchProfile(ndk, pubkey);
        if (!cancelled) setProfile(p);
      } catch {
        // silent
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [pubkey]);

  const name = profile?.displayName || profile?.name || formatPubkey(pubkey);
  const avatar = profile?.picture;
  const about = profile?.about;

  const avatarSize = size === "md" ? "w-10 h-10" : "w-6 h-6";
  const textSize = size === "md" ? "text-sm" : "text-xs";

  return (
    <div className="flex items-center gap-2">
      {avatar ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={avatar}
          alt={name}
          className={`${avatarSize} rounded-full object-cover border border-zinc-700`}
          onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
        />
      ) : (
        <div className={`${avatarSize} rounded-full bg-zinc-700 flex items-center justify-center`}>
          <span className="text-zinc-400 text-xs">
            {name.charAt(0).toUpperCase()}
          </span>
        </div>
      )}
      <div className="min-w-0">
        <div className="flex items-center gap-1">
          <span className={`${textSize} text-zinc-200 font-medium truncate`}>
            {loading ? formatPubkey(pubkey) : name}
          </span>
          {isYou && (
            <span className="text-xs text-orange-400">(you)</span>
          )}
        </div>
        {size === "md" && about && (
          <p className={`text-xs text-zinc-500 truncate max-w-[200px]`}>
            {about.slice(0, 80)}
          </p>
        )}
      </div>
    </div>
  );
}
