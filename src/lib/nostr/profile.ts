/**
 * NIP-01 Profile fetching — kind:0 metadata events.
 */

import type NDK from "@nostr-dev-kit/ndk";
import { NDKFilter } from "@nostr-dev-kit/ndk";

export interface NostrProfile {
  name?: string;
  displayName?: string;
  about?: string;
  picture?: string;
  nip05?: string;
  lud16?: string; // Lightning address
  banner?: string;
}

const profileCache = new Map<string, NostrProfile | null>();

/**
 * Fetch a user's kind:0 profile from relays.
 * Results are cached in-memory for the session.
 */
export async function fetchProfile(
  ndk: NDK,
  pubkey: string,
): Promise<NostrProfile | null> {
  if (profileCache.has(pubkey)) return profileCache.get(pubkey) ?? null;

  const filter: NDKFilter = {
    kinds: [0],
    authors: [pubkey],
    limit: 1,
  };

  try {
    const events = await ndk.fetchEvents(filter);
    for (const event of events) {
      try {
        const profile = JSON.parse(event.content) as NostrProfile;
        profileCache.set(pubkey, profile);
        return profile;
      } catch {
        // Invalid JSON in kind:0
      }
    }
  } catch {
    // Relay error
  }

  profileCache.set(pubkey, null);
  return null;
}

/**
 * Format a pubkey for display: npub prefix or truncated hex.
 */
export function formatPubkey(pubkey: string): string {
  if (pubkey.startsWith("npub")) return pubkey.slice(0, 12) + "…";
  return pubkey.slice(0, 8) + "…" + pubkey.slice(-4);
}
