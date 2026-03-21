import { NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/server/auth";
import { syncBounties, syncBountiesIncremental } from "@/lib/server/bounty-sync";

/**
 * POST /api/bounties/sync
 *
 * Trigger a sync of bounty events from Nostr relays into the local cache.
 * Requires authentication.
 *
 * Body (optional):
 *   { "incremental": true }  — only fetch events newer than last cached
 *   { "since": 1700000000 }  — fetch events after this unix timestamp
 *   { "limit": 100 }         — max events to fetch
 */
export async function POST(request: Request): Promise<NextResponse> {
  const identity = authenticateRequest(request);
  if (!identity) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json().catch(() => ({}));
    const incremental = body?.incremental === true;
    const since = typeof body?.since === "number" ? body.since : 0;
    const limit = typeof body?.limit === "number" ? body.limit : 200;

    const result = incremental
      ? await syncBountiesIncremental(limit)
      : await syncBounties(since, limit);

    return NextResponse.json({
      success: true,
      ...result,
    });
  } catch (error) {
    console.error("Sync failed:", error);
    return NextResponse.json(
      { error: "Sync failed", details: String(error) },
      { status: 500 },
    );
  }
}
