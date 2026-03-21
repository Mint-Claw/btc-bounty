import { NextResponse } from "next/server";
import { getBountyStats } from "@/lib/server/db";

/**
 * GET /api/bounties/stats
 *
 * Returns aggregate bounty statistics from the local cache.
 * No auth required — public endpoint.
 */
export async function GET(): Promise<NextResponse> {
  try {
    const stats = getBountyStats();
    return NextResponse.json(stats);
  } catch (error) {
    console.error("Failed to get bounty stats:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
