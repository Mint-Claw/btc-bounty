/**
 * Server-side NOSTR event signing using nostr-tools.
 * For agent API — bypasses NIP-07 browser extension requirement.
 */

import {
  generateSecretKey,
  getPublicKey,
  finalizeEvent,
} from "nostr-tools/pure";
import { bytesToHex, hexToBytes } from "nostr-tools/utils";

export interface SignedEvent {
  id: string;
  pubkey: string;
  created_at: number;
  kind: number;
  tags: string[][];
  content: string;
  sig: string;
}

/**
 * Generate a new keypair. Returns hex-encoded nsec and npub.
 */
export function generateKeypair(): { nsec: string; pubkey: string } {
  const sk = generateSecretKey();
  return {
    nsec: bytesToHex(sk),
    pubkey: getPublicKey(sk),
  };
}

/**
 * Get the public key from a hex-encoded secret key.
 */
export function pubkeyFromNsec(nsecHex: string): string {
  return getPublicKey(hexToBytes(nsecHex));
}

/**
 * Sign a NOSTR event server-side with a hex-encoded secret key.
 */
export function signEventServer(
  nsecHex: string,
  event: {
    kind: number;
    content: string;
    tags: string[][];
    created_at?: number;
  },
): SignedEvent {
  const sk = hexToBytes(nsecHex);
  const template = {
    kind: event.kind,
    content: event.content,
    tags: event.tags,
    created_at: event.created_at ?? Math.floor(Date.now() / 1000),
  };

  const signed = finalizeEvent(template, sk);
  return {
    id: signed.id,
    pubkey: signed.pubkey,
    created_at: signed.created_at,
    kind: signed.kind,
    tags: signed.tags,
    content: signed.content,
    sig: signed.sig,
  };
}
