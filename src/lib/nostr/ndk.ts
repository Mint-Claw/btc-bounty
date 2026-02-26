/**
 * NDK Singleton — NOSTR Development Kit relay pool.
 *
 * Loaded client-side only. Use dynamic import with ssr:false.
 */

import NDK from "@nostr-dev-kit/ndk";
import { DEFAULT_RELAYS } from "@/constants/relays";

let ndkInstance: NDK | null = null;

/**
 * Get or create the NDK singleton.
 * Connects to configured relay pool on first call.
 */
export async function getNDK(): Promise<NDK> {
  if (ndkInstance) return ndkInstance;

  ndkInstance = new NDK({
    explicitRelayUrls: DEFAULT_RELAYS,
  });

  await ndkInstance.connect();
  return ndkInstance;
}

/**
 * Get NDK without connecting (for SSR-safe imports).
 */
export function getNDKSync(): NDK | null {
  return ndkInstance;
}
