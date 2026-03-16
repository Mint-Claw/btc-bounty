/**
 * Server-side bounty NOSTR event updater.
 *
 * Updates kind:30402 events (parameterized replaceable) by
 * re-publishing with modified tags. Used by the webhook handler
 * to mark bounties as "funded" or "paid" on NOSTR.
 */

import { BOUNTY_KIND } from "@/lib/nostr/schema";
import { signEventServer } from "./signing";
import { publishToRelays, fetchFromRelays } from "./relay";
import { getAgentByPubkey } from "./auth";

/**
 * Update a bounty's NOSTR event to reflect escrow funding status.
 *
 * Fetches the existing event, modifies the status/funding tags,
 * re-signs with the poster's managed nsec, and re-publishes.
 *
 * @param bountyDTag - The bounty's d-tag identifier
 * @param posterPubkey - The poster's hex pubkey
 * @param updates - Tags to add/update
 * @returns Number of relays the update was published to, or 0 on failure
 */
export async function updateBountyEvent(
  bountyDTag: string,
  posterPubkey: string,
  updates: {
    status?: string;
    funded?: boolean;
    winner?: string;
  },
): Promise<number> {
  // Look up the poster's managed signing key
  const agent = getAgentByPubkey(posterPubkey);
  if (!agent) {
    console.warn(
      `[bounty-updater] No managed nsec for pubkey ${posterPubkey.slice(0, 12)}... — cannot update NOSTR event`,
    );
    return 0;
  }

  // Fetch the existing bounty event from relays
  const events = await fetchFromRelays({
    kinds: [BOUNTY_KIND],
    authors: [posterPubkey],
    "#d": [bountyDTag],
    limit: 1,
  });

  if (events.length === 0) {
    console.warn(
      `[bounty-updater] No existing event found for d=${bountyDTag} by ${posterPubkey.slice(0, 12)}...`,
    );
    return 0;
  }

  const existing = events[0];

  // Clone and modify tags
  const newTags = existing.tags.map((tag) => [...tag]);

  // Update or add status tag
  if (updates.status) {
    const statusIdx = newTags.findIndex((t) => t[0] === "status");
    if (statusIdx >= 0) {
      newTags[statusIdx] = ["status", updates.status];
    } else {
      newTags.push(["status", updates.status]);
    }
  }

  // Add/update funded tag
  if (updates.funded !== undefined) {
    const fundedIdx = newTags.findIndex((t) => t[0] === "funded");
    if (fundedIdx >= 0) {
      newTags[fundedIdx] = ["funded", updates.funded ? "true" : "false"];
    } else {
      newTags.push(["funded", updates.funded ? "true" : "false"]);
    }
  }

  // Update winner tag
  if (updates.winner) {
    const winnerIdx = newTags.findIndex((t) => t[0] === "winner");
    if (winnerIdx >= 0) {
      newTags[winnerIdx] = ["winner", updates.winner];
    } else {
      newTags.push(["winner", updates.winner]);
    }
  }

  // Re-sign and publish (kind:30402 is replaceable by d-tag)
  const signed = signEventServer(agent.nsecHex, {
    kind: BOUNTY_KIND,
    content: existing.content,
    tags: newTags,
  });

  try {
    const relayCount = await publishToRelays(signed);
    console.log(
      `[bounty-updater] Updated bounty d=${bountyDTag}: ` +
        `${JSON.stringify(updates)} → ${relayCount} relays`,
    );
    return relayCount;
  } catch (e) {
    console.error(`[bounty-updater] Failed to publish update:`, e);
    return 0;
  }
}

/**
 * Mark a bounty as funded on NOSTR (escrow invoice settled).
 */
export async function markBountyFunded(
  bountyDTag: string,
  posterPubkey: string,
): Promise<number> {
  return updateBountyEvent(bountyDTag, posterPubkey, { funded: true });
}

/**
 * Mark a bounty as completed and paid on NOSTR.
 */
export async function markBountyPaid(
  bountyDTag: string,
  posterPubkey: string,
  winnerPubkey: string,
): Promise<number> {
  return updateBountyEvent(bountyDTag, posterPubkey, {
    status: "COMPLETED",
    funded: true,
    winner: winnerPubkey,
  });
}
