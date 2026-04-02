/**
 * POST /api/bounties/:id/apply — Submit an application to a bounty
 *
 * Applications are stored in SQLite (guaranteed) and optionally
 * published to NOSTR relays as kind:1 replies (best-effort).
 * This ensures applications are never lost even if relays reject kind:1.
 */

import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/server/auth";
import { signEventServer } from "@/lib/server/signing";
import { publishToRelays, fetchFromRelays } from "@/lib/server/relay";
import { deliverWebhook } from "@/lib/server/webhooks";
import { notifyBountyApplication } from "@/lib/server/notifications";
import { insertApplication, getCachedBounty } from "@/lib/server/db";
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

  const { id: bountyId } = await params;

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

  // Look up bounty to get event ID and poster pubkey
  let bountyEventId = bountyId;
  let posterPubkey = "";
  let bountyTitle = "";

  // Check cache first (fast, no network)
  try {
    const cached = getCachedBounty(bountyId);
    if (cached) {
      bountyEventId = cached.id || bountyEventId;
      posterPubkey = cached.pubkey || "";
      bountyTitle = cached.title || "";
    }
  } catch { /* ignore */ }

  // Fall back to relay lookup if cache miss
  if (!posterPubkey) {
    try {
      const events = await fetchFromRelays({ kinds: [BOUNTY_KIND], "#d": [bountyId] });
      if (events.length > 0) {
        bountyEventId = events[0].id;
        posterPubkey = events[0].pubkey;
        const parsed = parseBountyEvent(events[0]);
        if (parsed) bountyTitle = parsed.title;
      }
    } catch { /* ignore */ }
  }

  // Store application in SQLite (guaranteed persistence)
  const applicationId = crypto.randomUUID();
  console.log("[apply] Storing application", applicationId, "for bounty", bountyId);
  try {
    insertApplication({
      id: applicationId,
      bountyDTag: bountyId,
      bountyEventId,
      applicantPubkey: agent.pubkey,
      pitch: pitch as string,
      lightning,
    });
  } catch (err) {
    console.error("[apply] DB insert failed:", err);
    return NextResponse.json(
      { error: "Failed to store application" },
      { status: 500 },
    );
  }

  // Best-effort: publish to NOSTR relays as kind:1 reply
  let relaysPublished = 0;
  let nostrEventId: string | undefined;
  try {
    const content = lightning ? `${pitch}\n\nLightning: ${lightning}` : pitch as string;
    const tags: string[][] = [
      ["e", bountyEventId, "", "reply"],
    ];
    if (posterPubkey) tags.push(["p", posterPubkey]);

    const signed = signEventServer(agent.nsecHex, {
      kind: 1,
      content,
      tags,
    });
    nostrEventId = signed.id;

    relaysPublished = await publishToRelays(signed);
  } catch (err) {
    console.warn("[apply] Relay publish failed (application still stored):", err);
  }

  // Notify bounty poster (async, non-blocking)
  if (posterPubkey && bountyTitle) {
    notifyBountyApplication({
      posterPubkey,
      bountyTitle,
      bountyId,
      applicantName: agent.pubkey.slice(0, 12) + "...",
      message: pitch as string,
    }).catch((e: Error) => console.error("[apply] Notification failed:", e.message));
  }

  // Webhook
  deliverWebhook("bounty.applied", {
    bountyId,
    applicationId,
    applicantPubkey: agent.pubkey,
    pitch: pitch as string,
    ...(lightning && { lightning }),
  });

  return NextResponse.json(
    {
      id: applicationId,
      nostrEventId,
      pubkey: agent.pubkey,
      bountyId,
      relaysPublished,
      stored: true,
    },
    { status: 201 },
  );
}
