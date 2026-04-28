import { nip19 } from "nostr-tools";
import { BOUNTY_KIND, type Bounty } from "@/lib/nostr/schema";

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

export function isActiveOpenBounty(bounty: Bounty, now: number): boolean {
  return bounty.status === "OPEN" && (!bounty.expiry || bounty.expiry > now);
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
