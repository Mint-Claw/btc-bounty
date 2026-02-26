/**
 * Bounty event helpers — create, publish, and query bounties via NDK.
 */

import { getNDK } from "./ndk";
import { BOUNTY_KIND, type Bounty, parseBountyEvent, buildBountyTags, type BountyCategory } from "./schema";
import { signEvent } from "./nip07";
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

  // Sort by newest first
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

  const tags = buildBountyTags({
    dTag,
    ...params,
  });

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
