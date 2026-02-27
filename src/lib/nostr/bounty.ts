/**
 * Bounty event helpers — create, publish, update, and query bounties via NDK.
 */

import { getNDK } from "./ndk";
import {
  BOUNTY_KIND,
  type Bounty,
  type BountyApplication,
  type BountyStatus,
  parseBountyEvent,
  buildBountyTags,
  type BountyCategory,
} from "./schema";
import { signEvent, getPublicKey } from "./nip07";
import type NDK from "@nostr-dev-kit/ndk";
import { NDKEvent, NDKFilter } from "@nostr-dev-kit/ndk";

/**
 * Fetch all open bounties from relays.
 */
export async function fetchBounties(ndk: NDK): Promise<Bounty[]> {
  const filter: NDKFilter = {
    kinds: [BOUNTY_KIND as number],
    limit: 100,
  };

  const events = await ndk.fetchEvents(filter);
  const bounties: Bounty[] = [];

  for (const event of events) {
    const bounty = parseBountyEvent({
      id: event.id,
      pubkey: event.pubkey,
      content: event.content,
      tags: event.tags.map((t) => [...t]),
      created_at: event.created_at ?? 0,
    });
    if (bounty) bounties.push(bounty);
  }

  bounties.sort((a, b) => b.createdAt - a.createdAt);
  return bounties;
}

/**
 * Publish a new bounty to relays.
 */
export async function publishBounty(params: {
  title: string;
  summary: string;
  content: string;
  rewardSats: number;
  category: BountyCategory;
  lightning: string;
  tags: string[];
  expiry?: number;
  image?: string;
}): Promise<string> {
  const ndk = await getNDK();
  const dTag = crypto.randomUUID();

  const tags = buildBountyTags({ dTag, ...params });

  const unsignedEvent = {
    kind: BOUNTY_KIND,
    content: params.content,
    tags,
    created_at: Math.floor(Date.now() / 1000),
  };

  const signedEvent = await signEvent(unsignedEvent);

  const ndkEvent = new NDKEvent(ndk);
  ndkEvent.kind = signedEvent.kind;
  ndkEvent.content = signedEvent.content;
  ndkEvent.tags = signedEvent.tags;
  ndkEvent.created_at = signedEvent.created_at;
  ndkEvent.pubkey = signedEvent.pubkey;
  ndkEvent.id = signedEvent.id;
  ndkEvent.sig = signedEvent.sig;

  await ndkEvent.publish();
  return signedEvent.id;
}

/**
 * Update a bounty's status (Mark Complete, Cancel, etc.).
 * Publishes a new kind:30402 with the same d-tag (replaceable event).
 * Only the original poster can update (verified by NIP-07).
 */
export async function updateBountyStatus(
  bounty: Bounty,
  newStatus: BountyStatus,
  winner?: string,
): Promise<string> {
  const ndk = await getNDK();
  const pubkey = await getPublicKey();

  if (pubkey !== bounty.pubkey) {
    throw new Error("Only the bounty poster can update status.");
  }

  const tags = buildBountyTags({
    dTag: bounty.dTag,
    title: bounty.title,
    summary: bounty.summary,
    rewardSats: bounty.rewardSats,
    category: bounty.category,
    lightning: bounty.lightning,
    tags: bounty.tags,
    expiry: bounty.expiry,
    image: bounty.image,
  });

  // Update status tag
  const statusIdx = tags.findIndex((t) => t[0] === "status");
  if (statusIdx >= 0) tags[statusIdx] = ["status", newStatus];

  // Set winner
  if (winner) {
    const winnerIdx = tags.findIndex((t) => t[0] === "winner");
    if (winnerIdx >= 0) tags[winnerIdx] = ["winner", winner];
    else tags.push(["winner", winner]);
  }

  const unsignedEvent = {
    kind: BOUNTY_KIND,
    content: bounty.content,
    tags,
    created_at: Math.floor(Date.now() / 1000),
  };

  const signedEvent = await signEvent(unsignedEvent);

  const ndkEvent = new NDKEvent(ndk);
  ndkEvent.kind = signedEvent.kind;
  ndkEvent.content = signedEvent.content;
  ndkEvent.tags = signedEvent.tags;
  ndkEvent.created_at = signedEvent.created_at;
  ndkEvent.pubkey = signedEvent.pubkey;
  ndkEvent.id = signedEvent.id;
  ndkEvent.sig = signedEvent.sig;

  await ndkEvent.publish();
  return signedEvent.id;
}

/**
 * Fetch applications (kind:1 replies) for a bounty.
 */
export async function fetchApplications(
  bountyEventId: string,
): Promise<BountyApplication[]> {
  const ndk = await getNDK();

  const filter: NDKFilter = {
    kinds: [1],
    "#e": [bountyEventId],
    limit: 50,
  };

  const events = await ndk.fetchEvents(filter);
  const apps: BountyApplication[] = [];

  for (const event of events) {
    const lightningTag = event.tags.find((t) => t[0] === "lightning")?.[1];
    const lightningMatch = event.content.match(
      /(?:lightning[:\s]+)?([a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/i,
    );

    apps.push({
      id: event.id,
      pubkey: event.pubkey,
      content: event.content,
      lightning: lightningTag || lightningMatch?.[1] || "",
      bountyEventId,
      createdAt: event.created_at ?? 0,
    });
  }

  apps.sort((a, b) => b.createdAt - a.createdAt);
  return apps;
}
