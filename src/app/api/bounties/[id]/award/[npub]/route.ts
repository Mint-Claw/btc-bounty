/**
 * POST /api/bounties/:id/award/:npub — Select winner + mark bounty complete
 *
 * Updates SQLite first (guaranteed), then publishes to NOSTR (best-effort).
 */

import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/server/auth";
import { signEventServer } from "@/lib/server/signing";
import { publishToRelays, fetchFromRelays } from "@/lib/server/relay";
import { BOUNTY_KIND, parseBountyEvent } from "@/lib/nostr/schema";
import { createPayout } from "@/lib/server/btcpay";
import {
  getPaymentByBountyId,
  setPayoutInfo,
} from "@/lib/server/payments";
import { getCachedBounty, updateBountyStatus, updateApplicationStatus, getApplicationsForBounty } from "@/lib/server/db";
import { deliverWebhook } from "@/lib/server/webhooks";
import { TokuSyncService } from "@/lib/server/toku-sync";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; npub: string }> },
) {
  const agent = authenticateRequest(request);
  if (!agent) {
    return NextResponse.json(
      { error: "Unauthorized. Provide X-API-Key header." },
      { status: 401 },
    );
  }

  const { id: bountyId, npub: winnerPubkey } = await params;

  // Look up bounty — cache first, relay fallback
  let bountyEventId = bountyId;
  let bountyPubkey = "";
  let bountyTitle = "";
  let bountyTags: string[][] = [];
  let bountyContent = "";
  let dTag = bountyId;

  const cached = getCachedBounty(bountyId);
  if (cached) {
    bountyEventId = cached.id;
    bountyPubkey = cached.pubkey;
    bountyTitle = cached.title;
    dTag = cached.d_tag;
    bountyContent = cached.content || "";
    try { bountyTags = JSON.parse(cached.tags_json || "[]"); } catch { bountyTags = []; }
  } else {
    // Try relay lookup by d-tag first, then by event ID
    try {
      let events = await fetchFromRelays({ kinds: [BOUNTY_KIND], "#d": [bountyId] });
      if (events.length === 0) {
        events = await fetchFromRelays({ ids: [bountyId], kinds: [BOUNTY_KIND], limit: 1 });
      }
      if (events.length > 0) {
        const ev = events[0];
        bountyEventId = ev.id;
        bountyPubkey = ev.pubkey;
        bountyTags = ev.tags;
        bountyContent = ev.content;
        dTag = ev.tags.find((t) => t[0] === "d")?.[1] || bountyId;
        const parsed = parseBountyEvent({ id: ev.id, pubkey: ev.pubkey, content: ev.content, tags: ev.tags, created_at: ev.created_at });
        if (parsed) bountyTitle = parsed.title;
      }
    } catch { /* ignore relay errors */ }
  }

  if (!bountyPubkey) {
    return NextResponse.json({ error: "Bounty not found" }, { status: 404 });
  }

  // Verify the agent owns the bounty
  if (bountyPubkey !== agent.pubkey) {
    return NextResponse.json(
      { error: "Only the bounty poster can award it" },
      { status: 403 },
    );
  }

  // Update SQLite first (guaranteed)
  const updated = updateBountyStatus(dTag, "COMPLETED", winnerPubkey);
  if (!updated) {
    console.warn("[award] SQLite update failed for d_tag:", dTag);
  }

  // Update winning application status
  const apps = getApplicationsForBounty(dTag);
  for (const app of apps) {
    if (app.applicant_pubkey === winnerPubkey) {
      updateApplicationStatus(app.id, "accepted");
    } else {
      updateApplicationStatus(app.id, "rejected");
    }
  }

  // Best-effort: publish updated event to NOSTR
  let relaysPublished = 0;
  let signedId: string | undefined;
  try {
    const updatedTags = bountyTags.map((t) => {
      if (t[0] === "status") return ["status", "COMPLETED"];
      if (t[0] === "winner") return ["winner", winnerPubkey];
      return t;
    });
    if (!updatedTags.some((t) => t[0] === "winner")) {
      updatedTags.push(["winner", winnerPubkey]);
    }

    const signed = signEventServer(agent.nsecHex, {
      kind: BOUNTY_KIND,
      content: bountyContent,
      tags: updatedTags,
    });
    signedId = signed.id;
    relaysPublished = await publishToRelays(signed);
  } catch (e) {
    console.warn("[award] Relay publish failed (award still stored):", (e as Error).message);
  }

  // If escrow exists, trigger payout
  let payoutResult = null;
  try {
    const payment = await getPaymentByBountyId(dTag);
    if (payment && payment.status === "funded") {
      const body = await request.clone().json().catch(() => ({}));
      const winnerLud16 = (body as Record<string, string>)?.lightning;

      if (winnerLud16) {
        try {
          const payout = await createPayout({
            destination: winnerLud16,
            amount: payment.amountSats,
            bountyId: dTag,
            winnerPubkey,
          });
          await setPayoutInfo(payment.id, payout.id, winnerPubkey, winnerLud16);
          payoutResult = {
            payoutId: payout.id,
            state: payout.state,
            amountSats: payment.amountSats - payment.platformFeeSats,
            feeSats: payment.platformFeeSats,
          };
        } catch (e) {
          payoutResult = { error: `Payout failed: ${(e as Error).message}` };
        }
      } else {
        payoutResult = { error: "No Lightning address provided. Include 'lightning' in request body." };
      }
    }
  } catch { /* no payment system configured */ }

  // Cancel toku.agency listing (async, non-blocking)
  new TokuSyncService().cancelListing(dTag).catch(() => {});

  // Webhook
  deliverWebhook("bounty.completed", {
    bountyId,
    bountyTitle,
    winnerPubkey,
    ...(payoutResult && { payout: payoutResult }),
  });

  return NextResponse.json({
    id: signedId || bountyEventId,
    dTag,
    status: "COMPLETED",
    winner: winnerPubkey,
    relaysPublished,
    stored: true,
    ...(payoutResult && { payout: payoutResult }),
  });
}
