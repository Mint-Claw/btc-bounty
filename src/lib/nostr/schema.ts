/**
 * BTC-Bounty NOSTR Event Schema
 *
 * Kind 30402 (Classified Listing — NIP-99) used for bounty posts.
 * Kind 1 (Text Note) used for applications (replies to bounty events).
 */

export const BOUNTY_KIND = 30402;

/** Minimal Nostr event interface for server-side processing */
export interface NostrEvent {
  id: string;
  pubkey: string;
  created_at: number;
  kind: number;
  tags: string[][];
  content: string;
  sig: string;
}

export type BountyStatus = "OPEN" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED";

export type BountyCategory =
  | "code"
  | "design"
  | "writing"
  | "research"
  | "other";

export interface Bounty {
  /** NOSTR event ID */
  id: string;
  /** Poster pubkey (hex) */
  pubkey: string;
  /** Unique slug/uuid (d-tag) */
  dTag: string;
  /** Bounty title */
  title: string;
  /** Short summary */
  summary: string;
  /** Full markdown description */
  content: string;
  /** Reward amount in sats */
  rewardSats: number;
  /** Current status */
  status: BountyStatus;
  /** Category tag */
  category: BountyCategory;
  /** Poster's Lightning address */
  lightning: string;
  /** Optional expiry (unix timestamp) */
  expiry?: number;
  /** Created at (unix timestamp) */
  createdAt: number;
  /** Winner npub (set on completion) */
  winner?: string;
  /** Optional image URL */
  image?: string;
  /** Topic tags */
  tags: string[];
}

export interface BountyApplication {
  /** Event ID of the application */
  id: string;
  /** Applicant pubkey */
  pubkey: string;
  /** Pitch / cover letter */
  content: string;
  /** Applicant's Lightning address */
  lightning: string;
  /** The bounty event ID being replied to */
  bountyEventId: string;
  /** Created at */
  createdAt: number;
}

/**
 * Parse a kind:30402 NOSTR event into a Bounty object.
 * Returns null if the event is malformed.
 */
export function parseBountyEvent(event: {
  id: string;
  pubkey: string;
  content: string;
  tags: string[][];
  created_at: number;
}): Bounty | null {
  try {
    const getTag = (name: string): string | undefined =>
      event.tags.find((t) => t[0] === name)?.[1];

    const dTag = getTag("d");
    const title = getTag("title");
    const rewardStr = getTag("reward");

    // Required fields
    if (!dTag || !title) {
      console.warn(`Skipping malformed bounty event ${event.id}: missing d or title tag`);
      return null;
    }

    const tTags = event.tags
      .filter((t) => t[0] === "t")
      .map((t) => t[1]);

    return {
      id: event.id,
      pubkey: event.pubkey,
      dTag,
      title,
      summary: getTag("summary") || "",
      content: event.content,
      rewardSats: rewardStr ? parseInt(rewardStr, 10) : 0,
      status: (getTag("status") as BountyStatus) || "OPEN",
      category: (getTag("category") as BountyCategory) || "other",
      lightning: getTag("lightning") || "",
      expiry: getTag("expiry") ? parseInt(getTag("expiry")!, 10) : undefined,
      createdAt: event.created_at,
      winner: getTag("winner") || undefined,
      image: getTag("image") || undefined,
      tags: tTags,
    };
  } catch (e) {
    console.warn(`Failed to parse bounty event ${event.id}:`, e);
    return null;
  }
}

/**
 * Build kind:30402 tags for a new bounty.
 */
export function buildBountyTags(bounty: {
  dTag: string;
  title: string;
  summary: string;
  rewardSats: number;
  category: BountyCategory;
  lightning: string;
  tags: string[];
  expiry?: number;
  image?: string;
}): string[][] {
  const tags: string[][] = [
    ["d", bounty.dTag],
    ["title", bounty.title],
    ["summary", bounty.summary],
    ["reward", String(bounty.rewardSats), "sats"],
    ["status", "OPEN"],
    ["category", bounty.category],
    ["lightning", bounty.lightning],
    ["published_at", String(Math.floor(Date.now() / 1000))],
    ["winner", ""],
  ];

  for (const t of bounty.tags) {
    tags.push(["t", t]);
  }

  if (bounty.expiry) {
    tags.push(["expiry", String(bounty.expiry)]);
  }

  if (bounty.image) {
    tags.push(["image", bounty.image]);
  }

  return tags;
}
