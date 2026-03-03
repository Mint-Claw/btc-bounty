/**
 * GET /api/bounties/:id/applications — List applicants for a bounty
 */

import { NextRequest, NextResponse } from "next/server";
import { fetchFromRelays } from "@/lib/server/relay";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: bountyEventId } = await params;

  try {
    const filter = {
      kinds: [1],
      "#e": [bountyEventId],
      limit: 50,
    };

    const events = await fetchFromRelays(filter);

    const applications = events.map((event) => {
      const lightningTag = event.tags.find((t) => t[0] === "lightning")?.[1];
      const lightningMatch = event.content.match(
        /(?:lightning[:\s]+)?([a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/i,
      );

      return {
        id: event.id,
        pubkey: event.pubkey,
        content: event.content,
        lightning: lightningTag || lightningMatch?.[1] || "",
        createdAt: event.created_at,
      };
    });

    return NextResponse.json({
      applications,
      count: applications.length,
      bountyEventId,
    });
  } catch (e) {
    return NextResponse.json(
      { error: `Relay error: ${(e as Error).message}` },
      { status: 502 },
    );
  }
}
