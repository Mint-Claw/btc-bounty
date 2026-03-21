/**
 * Bounty Sync Service
 *
 * Pulls kind:30402 bounty events from relays into the local SQLite cache.
 * Reduces relay dependency and enables fast local reads.
 */

import { fetchFromRelays } from "./relay";
import { cacheBountyEvent, listCachedBounties } from "./db";
import { parseBountyEvent, BOUNTY_KIND } from "@/lib/nostr/schema";
import type { SignedEvent } from "./signing";

export interface SyncResult {
  fetched: number;
  cached: number;
  errors: number;
  durationMs: number;
}

/**
 * Sync bounty events from relays into the local cache.
 *
 * @param since - Only fetch events created after this unix timestamp.
 *                Defaults to 0 (fetch all).
 * @param limit - Max events to fetch per relay query.
 */
export async function syncBounties(
  since = 0,
  limit = 200,
): Promise<SyncResult> {
  const start = Date.now();
  let fetched = 0;
  let cached = 0;
  let errors = 0;

  try {
    const events = (await fetchFromRelays({
      kinds: [BOUNTY_KIND],
      since: since || undefined,
      limit,
    })) as SignedEvent[];

    fetched = events.length;

    for (const event of events) {
      try {
        const bounty = parseBountyEvent(event);
        if (!bounty) {
          errors++;
          continue;
        }

        cacheBountyEvent({
          id: bounty.id,
          dTag: bounty.dTag,
          pubkey: bounty.pubkey,
          kind: BOUNTY_KIND,
          title: bounty.title,
          summary: bounty.summary || undefined,
          content: bounty.content || undefined,
          rewardSats: bounty.rewardSats,
          status: bounty.status,
          category: bounty.category,
          lightning: bounty.lightning || undefined,
          winnerPubkey: bounty.winner || undefined,
          tags: event.tags,
          createdAt: bounty.createdAt,
        });
        cached++;
      } catch (e) {
        errors++;
        console.warn("Failed to cache bounty event:", e);
      }
    }
  } catch (e) {
    console.error("Failed to fetch from relays:", e);
    errors++;
  }

  return {
    fetched,
    cached,
    errors,
    durationMs: Date.now() - start,
  };
}

/**
 * Get the most recent cached event timestamp for incremental sync.
 */
export function getLastSyncTimestamp(): number {
  const recent = listCachedBounties({ limit: 1 });
  if (recent.length > 0) {
    return recent[0].created_at;
  }
  return 0;
}

/**
 * Incremental sync: only fetch events newer than the last cached event.
 */
export async function syncBountiesIncremental(
  limit = 200,
): Promise<SyncResult> {
  const since = getLastSyncTimestamp();
  return syncBounties(since, limit);
}
