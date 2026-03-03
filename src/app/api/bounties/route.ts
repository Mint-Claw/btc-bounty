/**
 * Agent REST API — Bounty endpoints
 * 
 * POST /api/bounties — Create a new bounty (requires X-API-Key)
 * GET  /api/bounties — List open bounties (public)
 */

import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/server/auth";
import { signEventServer } from "@/lib/server/signing";
import { publishToRelays, fetchFromRelays } from "@/lib/server/relay";
import {
  BOUNTY_KIND,
  buildBountyTags,
  parseBountyEvent,
  type BountyCategory,
} from "@/lib/nostr/schema";

export async function POST(request: NextRequest) {
  const agent = authenticateRequest(request);
  if (!agent) {
    return NextResponse.json(
      { error: "Unauthorized. Provide X-API-Key header." },
      { status: 401 },
    );
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { title, summary, content, rewardSats, category, lightning, tags, expiry, image } =
    body as {
      title?: string;
      summary?: string;
      content?: string;
      rewardSats?: number;
      category?: string;
      lightning?: string;
      tags?: string[];
      expiry?: number;
      image?: string;
    };

  if (!title || !content || !rewardSats || !lightning) {
    return NextResponse.json(
      { error: "Missing required fields: title, content, rewardSats, lightning" },
      { status: 400 },
    );
  }

  const dTag = crypto.randomUUID();
  const eventTags = buildBountyTags({
    dTag,
    title,
    summary: summary || "",
    rewardSats,
    category: (category as BountyCategory) || "other",
    lightning,
    tags: tags || [],
    expiry,
    image,
  });

  const signed = signEventServer(agent.nsecHex, {
    kind: BOUNTY_KIND,
    content,
    tags: eventTags,
  });

  try {
    const relayCount = await publishToRelays(signed);
    return NextResponse.json(
      {
        id: signed.id,
        pubkey: signed.pubkey,
        dTag,
        relaysPublished: relayCount,
      },
      { status: 201 },
    );
  } catch (e) {
    return NextResponse.json(
      { error: `Failed to publish: ${(e as Error).message}` },
      { status: 502 },
    );
  }
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const status = searchParams.get("status") || "OPEN";
  const category = searchParams.get("category");
  const limit = Math.min(parseInt(searchParams.get("limit") || "50"), 100);

  try {
    const filter: Record<string, unknown> = {
      kinds: [BOUNTY_KIND],
      limit,
    };

    const events = await fetchFromRelays(filter);
    const bounties = events
      .map((e) =>
        parseBountyEvent({
          id: e.id,
          pubkey: e.pubkey,
          content: e.content,
          tags: e.tags,
          created_at: e.created_at,
        }),
      )
      .filter((b) => b !== null)
      .filter((b) => !status || b.status === status)
      .filter((b) => !category || b.category === category);

    return NextResponse.json({ bounties, count: bounties.length });
  } catch (e) {
    return NextResponse.json(
      { error: `Relay error: ${(e as Error).message}` },
      { status: 502 },
    );
  }
}
