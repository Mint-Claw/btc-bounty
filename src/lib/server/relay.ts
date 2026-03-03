/**
 * Server-side relay publishing via nostr-tools (no NDK, no browser).
 */

import { Relay } from "nostr-tools/relay";
import type { SignedEvent } from "./signing";

const DEFAULT_RELAYS = (
  process.env.NEXT_PUBLIC_RELAYS ||
  "wss://relay.damus.io,wss://nos.lol,wss://nostr.wine"
).split(",");

/**
 * Publish a signed event to all configured relays.
 * Returns the number of relays that accepted the event.
 */
export async function publishToRelays(event: SignedEvent): Promise<number> {
  let published = 0;

  const results = await Promise.allSettled(
    DEFAULT_RELAYS.map(async (url) => {
      const relay = await Relay.connect(url.trim());
      try {
        await relay.publish(event as Parameters<typeof relay.publish>[0]);
        published++;
      } finally {
        relay.close();
      }
    }),
  );

  if (published === 0) {
    const errors = results
      .filter((r) => r.status === "rejected")
      .map((r) => (r as PromiseRejectedResult).reason?.message || "unknown");
    throw new Error(`Failed to publish to any relay: ${errors.join(", ")}`);
  }

  return published;
}

/**
 * Fetch events from relays matching a filter.
 */
export async function fetchFromRelays(
  filter: Record<string, unknown>,
): Promise<SignedEvent[]> {
  const events: SignedEvent[] = [];

  // Try first available relay
  for (const url of DEFAULT_RELAYS) {
    try {
      const relay = await Relay.connect(url.trim());
      try {
        const sub = relay.subscribe(
          [filter as Parameters<typeof relay.subscribe>[0][0]],
          {
            onevent(event) {
              events.push(event as unknown as SignedEvent);
            },
            oneose() {
              sub.close();
            },
          },
        );
        // Wait for EOSE with timeout
        await new Promise<void>((resolve) => {
          const orig = sub.close.bind(sub);
          sub.close = () => { orig(); resolve(); };
          setTimeout(() => { sub.close(); }, 5000);
        });
      } finally {
        relay.close();
      }
      break; // Got results from one relay, done
    } catch {
      continue;
    }
  }

  return events;
}
