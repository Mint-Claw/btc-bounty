"use client";

import { useState } from "react";
import { signEvent } from "@/lib/nostr/nip07";

interface Props {
  bountyTitle: string;
  rewardSats: number;
  bountyEventId: string;
  appUrl?: string;
}

export default function ShareToNostr({
  bountyTitle,
  rewardSats,
  bountyEventId,
  appUrl = typeof window !== "undefined" ? window.location.origin : "",
}: Props) {
  const [shared, setShared] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [error, setError] = useState("");

  async function handleShare() {
    setSharing(true);
    setError("");

    try {
      const bountyUrl = `${appUrl}/bounty/${bountyEventId}`;
      const content = `🏆 New bounty: ${bountyTitle} — ${rewardSats.toLocaleString()} sats\n\nApply here: ${bountyUrl}\n\n#bitcoin #bounty #nostr`;

      const unsignedEvent = {
        kind: 1,
        content,
        tags: [
          ["e", bountyEventId, "", "mention"],
          ["t", "bitcoin"],
          ["t", "bounty"],
          ["t", "nostr"],
        ],
        created_at: Math.floor(Date.now() / 1000),
      };

      const signedEvent = await signEvent(unsignedEvent);

      const { getNDK } = await import("@/lib/nostr/ndk");
      const ndk = await getNDK();
      const { NDKEvent } = await import("@nostr-dev-kit/ndk");

      const ndkEvent = new NDKEvent(ndk);
      ndkEvent.kind = signedEvent.kind;
      ndkEvent.content = signedEvent.content;
      ndkEvent.tags = signedEvent.tags;
      ndkEvent.created_at = signedEvent.created_at;
      ndkEvent.pubkey = signedEvent.pubkey;
      ndkEvent.id = signedEvent.id;
      ndkEvent.sig = signedEvent.sig;

      await ndkEvent.publish();
      setShared(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to share");
    } finally {
      setSharing(false);
    }
  }

  if (shared) {
    return (
      <div className="text-green-400 text-sm flex items-center gap-1">
        ✅ Shared to your NOSTR feed!
      </div>
    );
  }

  return (
    <div>
      <button
        onClick={handleShare}
        disabled={sharing}
        className="px-4 py-2 border border-purple-500/50 text-purple-400 rounded-lg text-sm hover:bg-purple-500/10 transition disabled:opacity-50"
      >
        {sharing ? "Signing…" : "📢 Share to NOSTR feed"}
      </button>
      {error && <p className="text-red-400 text-xs mt-1">{error}</p>}
    </div>
  );
}
