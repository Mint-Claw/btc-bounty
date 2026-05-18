import { nip19 } from "nostr-tools";
import { BOUNTY_KIND, type Bounty, type BountyCategory, type BountyStatus } from "@/lib/nostr/schema";
import type { BountyEventRow } from "@/lib/server/db";

export const AGENT_DISCOVERY_VERSION = "btc-bounty.agent-discovery.v1";

export interface AgentDiscoveryBounty {
  id: string;
  kind: typeof BOUNTY_KIND;
  pubkey: string;
  npub: string;
  dTag: string;
  nostrAddress: string;
  naddr: string;
  title: string;
  summary: string;
  content: string;
  reward: {
    amount: number;
    unit: "sats";
  };
  status: "OPEN";
  category: Bounty["category"];
  tags: string[];
  lightning: string;
  createdAt: number;
  expiry?: number;
  urls: {
    app: string;
  };
  nostr: {
    relays: string[];
    filters: Array<{
      kinds: [typeof BOUNTY_KIND];
      authors: [string];
      "#d": [string];
      limit: 1;
    }>;
  };
  moltbook: {
    discoverable: true;
    type: "btc-bounty";
    status: "open";
    tags: string[];
  };
}

export function normalizeBountyStatus(status: string | null | undefined): BountyStatus | null {
  const normalized = (status || "OPEN").trim().toUpperCase().replace(/-/g, "_");
  if (normalized === "ACTIVE" || normalized === "OPEN") return "OPEN";
  if (normalized === "IN_PROGRESS") return "IN_PROGRESS";
  if (normalized === "COMPLETED") return "COMPLETED";
  if (normalized === "CANCELLED" || normalized === "CANCELED") return "CANCELLED";
  return null;
}

export function isActiveOpenBounty(bounty: Bounty, now: number): boolean {
  return normalizeBountyStatus(bounty.status) === "OPEN" && (!bounty.expiry || bounty.expiry > now);
}

function getTag(tags: string[][], name: string): string | undefined {
  return tags.find((tag) => tag[0] === name)?.[1];
}

export function cachedBountyRowToBounty(row: BountyEventRow): Bounty | null {
  const status = normalizeBountyStatus(row.status);
  if (!status) return null;

  let tags: string[][] = [];
  try {
    tags = row.tags_json ? JSON.parse(row.tags_json) : [];
  } catch {
    tags = [];
  }

  const topicTags = tags
    .filter((tag) => tag[0] === "t" && tag[1])
    .map((tag) => tag[1]);
  const expiryTag = getTag(tags, "expiry");
  const expiry = expiryTag ? parseInt(expiryTag, 10) : undefined;

  return {
    id: row.id,
    pubkey: row.pubkey,
    dTag: row.d_tag,
    title: row.title,
    summary: row.summary || "",
    content: row.content || "",
    rewardSats: row.reward_sats,
    status,
    category: (row.category || "other") as BountyCategory,
    lightning: row.lightning || "",
    expiry: Number.isFinite(expiry) ? expiry : undefined,
    createdAt: row.created_at,
    winner: row.winner_pubkey || undefined,
    image: getTag(tags, "image"),
    tags: topicTags,
  };
}

export function formatAgentDiscoveryBounty(params: {
  bounty: Bounty;
  appUrl: string;
  relays: string[];
}): AgentDiscoveryBounty {
  const { bounty, appUrl, relays } = params;
  const normalizedAppUrl = appUrl.replace(/\/$/, "");
  const naddr = nip19.naddrEncode({
    kind: BOUNTY_KIND,
    pubkey: bounty.pubkey,
    identifier: bounty.dTag,
    relays,
  });

  return {
    id: bounty.id,
    kind: BOUNTY_KIND,
    pubkey: bounty.pubkey,
    npub: nip19.npubEncode(bounty.pubkey),
    dTag: bounty.dTag,
    nostrAddress: `${BOUNTY_KIND}:${bounty.pubkey}:${bounty.dTag}`,
    naddr,
    title: bounty.title,
    summary: bounty.summary,
    content: bounty.content,
    reward: {
      amount: bounty.rewardSats,
      unit: "sats",
    },
    status: "OPEN",
    category: bounty.category,
    tags: bounty.tags,
    lightning: bounty.lightning,
    createdAt: bounty.createdAt,
    expiry: bounty.expiry,
    urls: {
      app: `${normalizedAppUrl}/bounty/${encodeURIComponent(bounty.id)}`,
    },
    nostr: {
      relays,
      filters: [
        {
          kinds: [BOUNTY_KIND],
          authors: [bounty.pubkey],
          "#d": [bounty.dTag],
          limit: 1,
        },
      ],
    },
    moltbook: {
      discoverable: true,
      type: "btc-bounty",
      status: "open",
      tags: ["btc-bounty", "agent-bounty", bounty.category, ...bounty.tags],
    },
  };
}
