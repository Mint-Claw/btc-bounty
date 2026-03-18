/**
 * Server-side relay publishing via nostr-tools (no NDK, no browser).
 *
 * Uses the persistent relay pool for connection reuse and health monitoring.
 */

import { getRelayPool } from "./relay-pool";
import type { SignedEvent } from "./signing";

/**
 * Publish a signed event to all configured relays.
 * Returns the number of relays that accepted the event.
 */
export async function publishToRelays(event: SignedEvent): Promise<number> {
  return getRelayPool().publish(event);
}

/**
 * Fetch events from relays matching a filter.
 */
export async function fetchFromRelays(
  filter: Record<string, unknown>,
): Promise<SignedEvent[]> {
  return getRelayPool().fetch(filter);
}
