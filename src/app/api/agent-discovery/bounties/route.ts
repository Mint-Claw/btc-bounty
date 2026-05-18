/**
 * Public agent discovery feed for active BTCBOUNTY bounties.
 *
 * This route is intentionally read-only and does not touch BTCPay or operator auth.
 */

import { NextRequest, NextResponse } from "next/server";
import { DEFAULT_RELAYS } from "@/constants/relays";
import {
  AGENT_DISCOVERY_VERSION,
  cachedBountyRowToBounty,
  formatAgentDiscoveryBounty,
  isActiveOpenBounty,
} from "@/lib/agent-discovery/bounties";
import { fetchFromRelays } from "@/lib/server/relay";
import { listCachedBounties } from "@/lib/server/db";
import { BOUNTY_KIND, parseBountyEvent, type Bounty } from "@/lib/nostr/schema";

function getAppUrl(request: NextRequest): string {
  return process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin;
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const category = searchParams.get("category");
  const requestedLimit = parseInt(searchParams.get("limit") || "50", 10);
  const limit = Number.isFinite(requestedLimit)
    ? Math.min(Math.max(requestedLimit, 1), 100)
    : 50;
  const now = Math.floor(Date.now() / 1000);

  const merged = new Map<string, Bounty>();
  let relayError: string | null = null;

  try {
    const events = await fetchFromRelays({
      kinds: [BOUNTY_KIND],
      limit,
    });

    for (const event of events) {
      const bounty = parseBountyEvent({
        id: event.id,
        pubkey: event.pubkey,
        content: event.content,
        tags: event.tags,
        created_at: event.created_at,
      });
      if (!bounty || !isActiveOpenBounty(bounty, now)) continue;
      if (category && bounty.category !== category) continue;
      merged.set(bounty.dTag || bounty.id, bounty);
    }
  } catch (e) {
    relayError = (e as Error).message;
  }

  try {
    const cached = listCachedBounties({ category: category || undefined, limit: 100 });
    for (const row of cached) {
      const bounty = cachedBountyRowToBounty(row);
      if (!bounty || !isActiveOpenBounty(bounty, now)) continue;
      if (category && bounty.category !== category) continue;
      const key = bounty.dTag || bounty.id;
      if (!merged.has(key)) merged.set(key, bounty);
    }
  } catch (e) {
    if (merged.size === 0 && relayError) {
      return NextResponse.json(
        { error: `Relay error: ${relayError}; cache error: ${(e as Error).message}` },
        { status: 502 },
      );
    }
  }

  if (merged.size === 0 && relayError) {
    return NextResponse.json(
      { error: `Relay error: ${relayError}` },
      { status: 502 },
    );
  }

  const bounties = [...merged.values()]
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, limit)
    .map((bounty) =>
      formatAgentDiscoveryBounty({
        bounty,
        appUrl: getAppUrl(request),
        relays: DEFAULT_RELAYS,
      }),
    );

  return NextResponse.json({
    version: AGENT_DISCOVERY_VERSION,
    generatedAt: new Date(now * 1000).toISOString(),
    count: bounties.length,
    relays: DEFAULT_RELAYS,
    sources: {
      relays: relayError ? "error" : "ok",
      cache: "included",
    },
    bounties,
  });
}
