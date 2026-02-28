"use client";

import { nip19 } from "nostr-tools";

interface MessageButtonProps {
  pubkey: string;
  className?: string;
}

/**
 * Opens a NOSTR DM to the given pubkey.
 * 
 * Strategy (per spec US-008):
 * - Primary: deep-link to nostr:npub... which NOSTR clients handle
 * - Fallback: copy npub to clipboard with instructions
 */
export default function MessageButton({ pubkey, className = "" }: MessageButtonProps) {
  const npub = nip19.npubEncode(pubkey);
  const nostrUri = `nostr:${npub}`;

  const handleClick = () => {
    // Try opening nostr: URI (handled by Damus, Amethyst, Primal, etc.)
    const opened = window.open(nostrUri, "_blank");
    
    // If popup blocked or no handler, fall back to clipboard
    if (!opened) {
      navigator.clipboard.writeText(npub).then(() => {
        alert(
          `Copied ${npub.slice(0, 16)}... to clipboard.\n\n` +
          `Paste in your NOSTR client (Damus, Amethyst, Primal, nostrudel) ` +
          `to send a DM.`
        );
      }).catch(() => {
        // Last resort: show it
        prompt("Copy this npub to message in your NOSTR client:", npub);
      });
    }
  };

  return (
    <button
      onClick={handleClick}
      className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg border border-zinc-700 text-zinc-300 hover:text-white hover:border-zinc-500 transition ${className}`}
    >
      💬 Message
    </button>
  );
}
