import { NextResponse } from "next/server";
import { getCachedBounty, type BountyEventRow } from "@/lib/server/db";
import { getPaymentByBountyId } from "@/lib/server/payments";

/**
 * GET /api/bounties/:id
 *
 * Get enriched bounty detail by d-tag (id).
 * Returns cached data with computed fields + payment status.
 */

function enrichBounty(
  row: BountyEventRow,
  payment?: { status: string; funded: boolean; paid: boolean } | null,
) {
  const now = Math.floor(Date.now() / 1000);
  const ageSeconds = now - row.created_at;
  const ageHours = Math.floor(ageSeconds / 3600);

  let ageLabel: string;
  if (ageHours < 1) ageLabel = "just now";
  else if (ageHours < 24) ageLabel = `${ageHours}h ago`;
  else if (ageHours < 48) ageLabel = "yesterday";
  else ageLabel = `${Math.floor(ageHours / 24)}d ago`;

  return {
    ...row,
    reward_btc: (row.reward_sats / 1e8).toFixed(8),
    age_hours: ageHours,
    age_label: ageLabel,
    tags: row.tags_json ? JSON.parse(row.tags_json) : null,
    payment: payment || null,
  };
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  try {
    const { id } = await params;
    const bounty = getCachedBounty(id);
    if (!bounty) {
      return NextResponse.json(
        { error: "Bounty not found", d_tag: id },
        { status: 404 },
      );
    }

    // Enrich with payment status (non-blocking — gracefully null if payments table empty)
    let paymentInfo: { status: string; funded: boolean; paid: boolean } | null =
      null;
    try {
      const payment = await getPaymentByBountyId(id);
      if (payment) {
        paymentInfo = {
          status: payment.status,
          funded:
            payment.status === "funded" || payment.status === "paid",
          paid: payment.status === "paid",
        };
      }
    } catch {
      // Payment lookup failure shouldn't break bounty detail
    }

    return NextResponse.json(enrichBounty(bounty, paymentInfo));
  } catch (error) {
    console.error("Failed to get bounty detail:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
