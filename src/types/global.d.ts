/**
 * Global type augmentations for browser APIs.
 */

import type { UnsignedEvent } from "nostr-tools/pure";

declare global {
  interface Window {
    /** NIP-07 browser extension (Alby, nos2x, etc.) */
    nostr?: {
      getPublicKey(): Promise<string>;
      signEvent(event: UnsignedEvent): Promise<{
        id: string;
        sig: string;
        pubkey: string;
        kind: number;
        created_at: number;
        tags: string[][];
        content: string;
      }>;
      nip04?: {
        encrypt(pubkey: string, plaintext: string): Promise<string>;
        decrypt(pubkey: string, ciphertext: string): Promise<string>;
      };
    };
    /** WebLN provider (Alby, etc.) */
    webln?: {
      enable(): Promise<void>;
      sendPayment(paymentRequest: string): Promise<{ preimage: string }>;
      keysend(args: {
        destination: string;
        amount: string | number;
      }): Promise<{ preimage: string }>;
    };
  }
}

export {};
