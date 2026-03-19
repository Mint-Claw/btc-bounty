/**
 * POST /api/admin/expire
 *
 * Trigger bounty expiration check. Finds all open bounties past their
 * expiration date and updates their status to "expired" on NOSTR.
 *
 * Can be called by a cron job or manually from the admin dashboard.
 */

import { NextResponse } from "next/server";
import { expireStale } from "@/lib/server/expiration";

export async function POST() {
  try {
    const result = await expireStale();
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : "Expiration check failed",
      },
      { status: 500 },
    );
  }
}
