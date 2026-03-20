/**
 * Bounty Expiration Service
 *
 * Checks for bounties past their expiration date and updates their
 * NOSTR status to "expired". Designed to be called periodically
 * (e.g., daily cron or on-demand via admin API).
 *
 * A bounty expires when:
 * 1. It has an explicit "expiration" tag with a unix timestamp
 * 2. The current time exceeds that timestamp
 * 3. The bounty status is still "open"
 *
 * Expired bounties get status updated to "expired" on NOSTR relays.
 */

import { BOUNTY_KIND } from "@/lib/nostr/schema";
import { fetchFromRelays } from "./relay";
import { updateBountyEvent } from "./bounty-updater";
import { deliverWebhook } from "./webhooks";
import type { NostrEvent } from "@/lib/nostr/schema";

/** Default expiration period (30 days) in seconds */
export const DEFAULT_EXPIRATION_SECS = 30 * 24 * 60 * 60;

/**
 * Find and expire stale bounties.
 *
 * @param now - Current unix timestamp (defaults to Date.now()/1000)
 * @returns Summary of expired bounties
 */
export async function expireStale(
  now: number = Math.floor(Date.now() / 1000),
): Promise<ExpireResult> {
  const result: ExpireResult = {
    checked: 0,
    expired: 0,
    errors: [],
  };

  // Fetch all open bounties from relays
  const events = await fetchFromRelays(
    { kinds: [BOUNTY_KIND], "#status": ["OPEN"] },
  );

  result.checked = events.length;

  for (const event of events) {
    const expiration = getExpiration(event, now);
    if (expiration === null) continue; // No expiration set
    if (expiration > now) continue; // Not yet expired

    // This bounty is past its expiration
    const dTag = event.tags.find((t) => t[0] === "d")?.[1];
    if (!dTag) continue;

    try {
      const published = await updateBountyEvent(dTag, event.pubkey, {
        status: "expired",
      });

      if (published > 0) {
        result.expired++;
        await deliverWebhook("bounty.expired", {
          bountyDTag: dTag,
          posterPubkey: event.pubkey,
          expiredAt: now,
        });
      } else {
        result.errors.push(
          `Failed to update ${dTag}: no managed key for poster`,
        );
      }
    } catch (err) {
      result.errors.push(
        `Error expiring ${dTag}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  return result;
}

/**
 * Extract expiration timestamp from a bounty event.
 *
 * Checks for NIP-40 "expiration" tag first, then falls back to
 * created_at + DEFAULT_EXPIRATION_SECS if no explicit expiration.
 *
 * @returns Unix timestamp when bounty expires, or null if no expiration policy
 */
export function getExpiration(
  event: NostrEvent,
  _now?: number,
): number | null {
  // NIP-40: explicit expiration tag
  const expTag = event.tags.find((t) => t[0] === "expiration");
  if (expTag?.[1]) {
    const ts = parseInt(expTag[1], 10);
    if (!isNaN(ts)) return ts;
  }

  // Fallback: created_at + default period
  if (event.created_at) {
    return event.created_at + DEFAULT_EXPIRATION_SECS;
  }

  return null;
}

export interface ExpireResult {
  checked: number;
  expired: number;
  errors: string[];
}
