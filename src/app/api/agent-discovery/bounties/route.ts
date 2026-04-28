/**
 * Public agent discovery feed for active BTCBOUNTY bounties.
 *
 * This route is intentionally read-only and does not touch BTCPay or operator auth.
 */

import { NextRequest, NextResponse } from "next/server";
import { DEFAULT_RELAYS } from "@/constants/relays";
import {
  AGENT_DISCOVERY_VERSION,
  formatAgentDiscoveryBounty,
  isActiveOpenBounty,
} from "@/lib/agent-discovery/bounties";
import { fetchFromRelays } from "@/lib/server/relay";
import { BOUNTY_KIND, parseBountyEvent } from "@/lib/nostr/schema";

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

  try {
    const events = await fetchFromRelays({
      kinds: [BOUNTY_KIND],
      limit,
    });

    const bounties = events
      .map((event) =>
        parseBountyEvent({
          id: event.id,
          pubkey: event.pubkey,
          content: event.content,
          tags: event.tags,
          created_at: event.created_at,
        }),
      )
      .filter((bounty) => bounty !== null)
      .filter((bounty) => isActiveOpenBounty(bounty, now))
      .filter((bounty) => !category || bounty.category === category)
      .sort((a, b) => b.createdAt - a.createdAt)
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
      bounties,
    });
  } catch (e) {
    return NextResponse.json(
      { error: `Relay error: ${(e as Error).message}` },
      { status: 502 },
    );
  }
}
