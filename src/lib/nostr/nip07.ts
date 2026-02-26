/**
 * NIP-07 Adapter — Unified interface for browser extensions.
 *
 * Uses window.nostr (typed by nostr-tools).
 * All private key operations happen in the extension — never in our code.
 */

export interface NostrSignedEvent {
  id: string;
  pubkey: string;
  created_at: number;
  kind: number;
  tags: string[][];
  content: string;
  sig: string;
}

export class NIP07Error extends Error {
  constructor(
    message: string,
    public code: "NO_EXTENSION" | "USER_REJECTED" | "UNKNOWN",
  ) {
    super(message);
    this.name = "NIP07Error";
  }
}

/**
 * Check if a NIP-07 extension is available.
 */
export function hasNIP07(): boolean {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return typeof window !== "undefined" && !!(window as any).nostr;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getNostr(): any {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (window as any).nostr;
}

/**
 * Get the user's public key from their NIP-07 extension.
 */
export async function getPublicKey(): Promise<string> {
  if (!hasNIP07()) {
    throw new NIP07Error(
      "No NOSTR browser extension detected. Install Alby or nos2x.",
      "NO_EXTENSION",
    );
  }

  try {
    return await getNostr().getPublicKey() as string;
  } catch (e) {
    if (e instanceof Error && e.message?.includes("rejected")) {
      throw new NIP07Error("User rejected the request.", "USER_REJECTED");
    }
    throw new NIP07Error(
      `Failed to get public key: ${e instanceof Error ? e.message : String(e)}`,
      "UNKNOWN",
    );
  }
}

/**
 * Sign a NOSTR event using the NIP-07 extension.
 */
export async function signEvent(event: {
  kind: number;
  content: string;
  tags: string[][];
  created_at: number;
}): Promise<NostrSignedEvent> {
  if (!hasNIP07()) {
    throw new NIP07Error(
      "No NOSTR browser extension detected. Install Alby or nos2x.",
      "NO_EXTENSION",
    );
  }

  try {
    return await getNostr().signEvent(event) as NostrSignedEvent;
  } catch (e) {
    if (e instanceof Error && e.message?.includes("rejected")) {
      throw new NIP07Error("User rejected signing.", "USER_REJECTED");
    }
    throw new NIP07Error(
      `Failed to sign event: ${e instanceof Error ? e.message : String(e)}`,
      "UNKNOWN",
    );
  }
}
