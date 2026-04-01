/**
 * POST /api/admin/sync — Trigger bounty cache sync from relays
 *
 * Pulls kind:30402 events from NOSTR relays into local SQLite cache.
 * Can be called by a cron job or manually.
 *
 * Query params:
 *   ?full=true  — Full sync (fetch all events). Default is incremental.
 *
 * Auth: x-admin-secret header when ADMIN_SECRET is set.
 */

import { NextRequest, NextResponse } from "next/server";
import { syncBounties, syncBountiesIncremental } from "@/lib/server/bounty-sync";
import { log } from "@/lib/server/logger";

export async function POST(request: NextRequest): Promise<NextResponse> {
  // Auth check
  const adminSecret = process.env.ADMIN_SECRET;
  if (adminSecret) {
    const auth = request.headers.get("x-admin-secret");
    if (auth !== adminSecret) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const full = request.nextUrl.searchParams.get("full") === "true";

  try {
    const result = full
      ? await syncBounties(0, 500)
      : await syncBountiesIncremental(200);

    log.info("Bounty sync completed", {
      mode: full ? "full" : "incremental",
      fetched: result.fetched,
      cached: result.cached,
      errors: result.errors,
      durationMs: result.durationMs,
    });

    return NextResponse.json({
      ok: true,
      mode: full ? "full" : "incremental",
      ...result,
    });
  } catch (err) {
    log.error("Bounty sync failed", {
      error: err instanceof Error ? err.message : String(err),
    });

    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Sync failed" },
      { status: 500 },
    );
  }
}
