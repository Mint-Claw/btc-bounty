/**
 * toku.agency → NOSTR Reply Bridge
 *
 * When a bid arrives from toku.agency on a cross-listed bounty,
 * publish a kind:1 NOSTR note as a reply to the original bounty event.
 * This makes toku.agency applications visible in the NOSTR bounty thread.
 *
 * Uses the platform's managed signing key (PLATFORM_NSEC env var)
 * since toku agents don't have NOSTR identities.
 */

import { signEventServer } from "./signing";
import { publishToRelays } from "./relay";
import { BOUNTY_KIND } from "@/lib/nostr/schema";
import { getListing } from "./toku";
import type { TokuApplicant } from "./toku-sync";

// ─── Config ──────────────────────────────────────────────────

/** Platform nsec for signing bridge messages (hex-encoded) */
function getPlatformNsec(): string {
  return process.env.PLATFORM_NSEC || "";
}

// ─── Reply Builder ───────────────────────────────────────────

/**
 * Build the content for a NOSTR reply that represents a toku.agency bid.
 */
export function buildBidReplyContent(applicant: TokuApplicant): string {
  const priceDollars = (applicant.priceCents / 100).toFixed(2);
  const lines = [
    `🤖 **Agent application via toku.agency**`,
    "",
    applicant.message || "(no message)",
    "",
    `**Bid:** $${priceDollars} USD`,
    `**Agent ID:** ${applicant.tokuAgentId}`,
    `**Bid ID:** ${applicant.bidId}`,
    "",
    `_To accept this bid, reply with the bounty award command._`,
  ];
  return lines.join("\n");
}

/**
 * Build NIP-10 reply tags for a kind:1 reply to a kind:30402 bounty.
 *
 * Per NIP-10:
 * - ["e", <bounty-event-id>, <relay>, "root"] — the bounty event
 * - ["p", <bounty-poster-pubkey>] — notify the poster
 * - ["a", "30402:<pubkey>:<d-tag>", <relay>] — addressable reference
 */
export function buildReplyTags(
  bountyEventId: string,
  bountyPubkey: string,
  bountyDTag: string,
  relay?: string
): string[][] {
  const relayHint = relay || "";
  return [
    ["e", bountyEventId, relayHint, "root"],
    ["p", bountyPubkey],
    ["a", `${BOUNTY_KIND}:${bountyPubkey}:${bountyDTag}`, relayHint],
    ["t", "toku-bridge"],
  ];
}

// ─── Publisher ───────────────────────────────────────────────

/**
 * Forward a toku.agency bid as a NOSTR kind:1 reply to the bounty.
 *
 * @returns Number of relays published to, or 0 on failure
 */
export async function forwardBidToNostr(
  bountyDTag: string,
  bountyEventId: string,
  bountyPubkey: string,
  applicant: TokuApplicant
): Promise<number> {
  const nsec = getPlatformNsec();
  if (!nsec) {
    console.warn(
      "[toku-nostr-bridge] PLATFORM_NSEC not set, cannot publish NOSTR reply"
    );
    return 0;
  }

  const content = buildBidReplyContent(applicant);
  const tags = buildReplyTags(bountyEventId, bountyPubkey, bountyDTag);

  const signed = signEventServer(nsec, {
    kind: 1,
    content,
    tags,
  });

  try {
    const relayCount = await publishToRelays(signed);
    console.log(
      `[toku-nostr-bridge] Published bid reply for bounty ${bountyDTag} ` +
        `from toku agent ${applicant.tokuAgentId} → ${relayCount} relays`
    );
    return relayCount;
  } catch (err) {
    console.error("[toku-nostr-bridge] Failed to publish reply:", err);
    return 0;
  }
}

/**
 * Convenience: look up a listing and forward a bid.
 * Used as the onApplication callback in TokuSyncService.
 */
export async function handleTokuApplication(
  bountyDTag: string,
  applicant: TokuApplicant
): Promise<number> {
  const listing = getListing(bountyDTag);
  if (!listing) {
    console.warn(
      `[toku-nostr-bridge] No listing found for bounty ${bountyDTag}`
    );
    return 0;
  }

  // We need the poster's pubkey — in production this would come from DB.
  // For now, we can't derive it from the listing alone, so we fetch the event.
  // This is acceptable since bids are infrequent.
  const { fetchFromRelays } = await import("./relay");
  const events = await fetchFromRelays({
    kinds: [BOUNTY_KIND],
    "#d": [bountyDTag],
    limit: 1,
  });

  if (events.length === 0) {
    console.warn(
      `[toku-nostr-bridge] Could not find bounty event for ${bountyDTag}`
    );
    return 0;
  }

  const bountyEvent = events[0];
  return forwardBidToNostr(
    bountyDTag,
    bountyEvent.id,
    bountyEvent.pubkey,
    applicant
  );
}
