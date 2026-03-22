import { NextResponse } from "next/server";
import { getCachedBounty, type BountyEventRow } from "@/lib/server/db";

/**
 * GET /api/bounties/:id
 *
 * Get enriched bounty detail by d-tag (id).
 * Returns cached data with computed fields.
 */

function enrichBounty(row: BountyEventRow) {
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
    return NextResponse.json(enrichBounty(bounty));
  } catch (error) {
    console.error("Failed to get bounty detail:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
