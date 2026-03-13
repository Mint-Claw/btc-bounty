/**
 * POST /api/bounties/:id/award/:npub — Select winner + mark bounty complete
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
  updatePaymentStatus,
} from "@/lib/server/payments";

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

  const { id: bountyEventId, npub: winnerPubkey } = await params;

  // Fetch the original bounty to verify ownership and get tags
  const events = await fetchFromRelays({
    ids: [bountyEventId],
    kinds: [BOUNTY_KIND],
    limit: 1,
  });

  if (events.length === 0) {
    return NextResponse.json(
      { error: "Bounty not found" },
      { status: 404 },
    );
  }

  const bountyEvent = events[0];
  const bounty = parseBountyEvent({
    id: bountyEvent.id,
    pubkey: bountyEvent.pubkey,
    content: bountyEvent.content,
    tags: bountyEvent.tags,
    created_at: bountyEvent.created_at,
  });

  if (!bounty) {
    return NextResponse.json(
      { error: "Failed to parse bounty event" },
      { status: 500 },
    );
  }

  // Verify the agent owns the bounty
  if (bounty.pubkey !== agent.pubkey) {
    return NextResponse.json(
      { error: "Only the bounty poster can award it" },
      { status: 403 },
    );
  }

  // Update tags: set status=COMPLETED, winner=npub
  const updatedTags = bountyEvent.tags.map((t) => {
    if (t[0] === "status") return ["status", "COMPLETED"];
    if (t[0] === "winner") return ["winner", winnerPubkey];
    return t;
  });

  // Add winner tag if it didn't exist
  if (!updatedTags.some((t) => t[0] === "winner")) {
    updatedTags.push(["winner", winnerPubkey]);
  }

  const signed = signEventServer(agent.nsecHex, {
    kind: BOUNTY_KIND,
    content: bountyEvent.content,
    tags: updatedTags,
  });

  try {
    const relayCount = await publishToRelays(signed);

    // If escrow exists, trigger payout to the winner
    let payoutResult = null;
    const dTag = bountyEvent.tags.find((t) => t[0] === "d")?.[1];
    if (dTag) {
      const payment = await getPaymentByBountyId(dTag);
      if (payment && payment.status === "funded") {
        // Get winner's Lightning address from the request body or application
        const winnerLud16 = (await request.clone().json().catch(() => ({})))?.lightning;

        if (winnerLud16) {
          try {
            const payout = await createPayout({
              destination: winnerLud16,
              amount: payment.amountSats,
              bountyId: dTag,
              winnerPubkey,
            });

            await setPayoutInfo(
              payment.id,
              payout.id,
              winnerPubkey,
              winnerLud16,
            );

            payoutResult = {
              payoutId: payout.id,
              state: payout.state,
              amountSats: payment.amountSats - payment.platformFeeSats,
              feeSats: payment.platformFeeSats,
            };
          } catch (e) {
            console.error("[award] Payout failed:", e);
            payoutResult = {
              error: `Payout failed: ${(e as Error).message}`,
            };
          }
        } else {
          payoutResult = {
            error: "No Lightning address provided for winner. Include 'lightning' in request body.",
          };
        }
      }
    }

    return NextResponse.json({
      id: signed.id,
      status: "COMPLETED",
      winner: winnerPubkey,
      relaysPublished: relayCount,
      ...(payoutResult && { payout: payoutResult }),
    });
  } catch (e) {
    return NextResponse.json(
      { error: `Failed to publish: ${(e as Error).message}` },
      { status: 502 },
    );
  }
}
