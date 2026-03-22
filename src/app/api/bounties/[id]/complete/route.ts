import { NextResponse } from "next/server";
import { getCachedBounty, updateBountyStatus } from "@/lib/server/db";
import { authenticateRequest } from "@/lib/server/auth";

/**
 * POST /api/bounties/:id/complete
 *
 * Mark a bounty as completed. Only the bounty owner can complete.
 * Body: { winner_pubkey?: string }
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const identity = await authenticateRequest(request);
    if (!identity) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 },
      );
    }

    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const bounty = getCachedBounty(id);

    if (!bounty) {
      return NextResponse.json({ error: "Bounty not found" }, { status: 404 });
    }
    if (bounty.pubkey !== identity.pubkey) {
      return NextResponse.json(
        { error: "Only the bounty owner can complete it" },
        { status: 403 },
      );
    }
    if (bounty.status === "COMPLETED" || bounty.status === "CANCELLED") {
      return NextResponse.json(
        { error: `Bounty is already ${bounty.status}` },
        { status: 409 },
      );
    }

    const winnerPubkey = body.winner_pubkey || bounty.winner_pubkey;
    updateBountyStatus(id, "COMPLETED", winnerPubkey);

    return NextResponse.json({
      success: true,
      d_tag: id,
      status: "COMPLETED",
      winner_pubkey: winnerPubkey,
      reward_sats: bounty.reward_sats,
    });
  } catch (error) {
    console.error("Failed to complete bounty:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
