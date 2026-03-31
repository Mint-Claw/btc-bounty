/**
 * POST /api/bounties/:id/apply — Submit an application to a bounty
 */

import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/server/auth";
import { signEventServer } from "@/lib/server/signing";
import { publishToRelays } from "@/lib/server/relay";
import { deliverWebhook } from "@/lib/server/webhooks";
import { notifyBountyApplication } from "@/lib/server/notifications";
import { fetchFromRelays } from "@/lib/server/relay";
import { BOUNTY_KIND, parseBountyEvent } from "@/lib/nostr/schema";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const agent = authenticateRequest(request);
  if (!agent) {
    return NextResponse.json(
      { error: "Unauthorized. Provide X-API-Key header." },
      { status: 401 },
    );
  }

  const { id: bountyEventId } = await params;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { pitch, lightning } = body as { pitch?: string; lightning?: string };

  if (!pitch) {
    return NextResponse.json(
      { error: "Missing required field: pitch" },
      { status: 400 },
    );
  }

  const tags: string[][] = [
    ["e", bountyEventId, "", "reply"],
    ["p", ""], // Will be resolved if needed
  ];

  if (lightning) {
    tags.push(["lightning", lightning]);
  }

  const content = lightning ? `${pitch}\n\nLightning: ${lightning}` : pitch;

  const signed = signEventServer(agent.nsecHex, {
    kind: 1,
    content,
    tags,
  });

  try {
    const relayCount = await publishToRelays(signed);

    // Notify bounty poster via NIP-04 DM (async, non-blocking)
    fetchFromRelays({ kinds: [BOUNTY_KIND], "#d": [bountyEventId] })
      .then((events) => {
        if (events.length > 0) {
          const bounty = parseBountyEvent(events[0]);
          if (bounty) {
            notifyBountyApplication({
              posterPubkey: bounty.pubkey,
              bountyTitle: bounty.title,
              bountyId: bountyEventId,
              applicantName: signed.pubkey.slice(0, 12) + "...",
              message: pitch as string,
            });
          }
        }
      })
      .catch((e) => console.error("[apply] Notification fetch failed:", e));

    // Notify bounty poster via webhook
    deliverWebhook("bounty.applied", {
      bountyId: bountyEventId,
      applicantPubkey: signed.pubkey,
      applicationEventId: signed.id,
      pitch: pitch as string,
      ...(lightning && { lightning }),
    });

    return NextResponse.json(
      {
        id: signed.id,
        pubkey: signed.pubkey,
        bountyEventId,
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
