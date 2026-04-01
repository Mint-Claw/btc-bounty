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

export async function POST(request: Request) {
  // Auth check for production
  const adminSecret = process.env.ADMIN_SECRET;
  if (adminSecret) {
    const auth = request.headers.get("x-admin-secret");
    if (auth !== adminSecret) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

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
