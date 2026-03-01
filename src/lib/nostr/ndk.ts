/**
 * NDK Singleton — NOSTR Development Kit relay pool.
 *
 * Loaded client-side only. Use dynamic import with ssr:false.
 * Includes retry logic for relay connection failures.
 */

import NDK from "@nostr-dev-kit/ndk";
import { DEFAULT_RELAYS } from "@/constants/relays";

let ndkInstance: NDK | null = null;

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 2000;

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Get or create the NDK singleton.
 * Connects to configured relay pool on first call with retry.
 */
export async function getNDK(): Promise<NDK> {
  if (ndkInstance) return ndkInstance;

  const ndk = new NDK({
    explicitRelayUrls: DEFAULT_RELAYS,
  });

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      await ndk.connect();
      ndkInstance = ndk;
      return ndk;
    } catch (e) {
      console.warn(`NDK connect attempt ${attempt}/${MAX_RETRIES} failed:`, e);
      if (attempt < MAX_RETRIES) {
        await sleep(RETRY_DELAY_MS * attempt);
      }
    }
  }

  // Last resort: return the instance even if some relays failed
  // NDK will reconnect lazily
  ndkInstance = ndk;
  return ndk;
}

/**
 * Get NDK without connecting (for SSR-safe imports).
 */
export function getNDKSync(): NDK | null {
  return ndkInstance;
}
