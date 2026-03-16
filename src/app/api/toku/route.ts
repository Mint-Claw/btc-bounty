/**
 * toku.agency Bridge API
 *
 * GET  /api/toku         — List current toku.agency listings + stats
 * POST /api/toku         — Manual sync: cross-list all eligible open bounties
 * DELETE /api/toku?dTag= — Cancel a specific toku.agency listing
 */

import { NextRequest, NextResponse } from "next/server";
import { TokuSyncService } from "@/lib/server/toku-sync";
import { verifyApiKey } from "@/lib/server/auth";

let syncService: TokuSyncService | null = null;

function getSyncService(): TokuSyncService {
  if (!syncService) {
    syncService = new TokuSyncService();
  }
  return syncService;
}

// ─── GET: Status & listings ──────────────────────────────────

export async function GET(req: NextRequest): Promise<NextResponse> {
  const auth = verifyApiKey(req.headers.get("x-api-key") || "");
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const service = getSyncService();
  const stats = service.getStats();

  return NextResponse.json({
    bridge: "toku.agency",
    configured: !!process.env.TOKU_API_KEY,
    serviceId: process.env.TOKU_SERVICE_ID || null,
    ...stats,
  });
}

// ─── POST: Trigger manual sync ───────────────────────────────

export async function POST(req: NextRequest): Promise<NextResponse> {
  const auth = verifyApiKey(req.headers.get("x-api-key") || "");
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!process.env.TOKU_API_KEY) {
    return NextResponse.json(
      { error: "TOKU_API_KEY not configured" },
      { status: 503 }
    );
  }

  // Expect body with array of open bounties to sync
  let bounties;
  try {
    const body = await req.json();
    bounties = body.bounties;
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body, expected { bounties: [...] }" },
      { status: 400 }
    );
  }

  if (!Array.isArray(bounties)) {
    return NextResponse.json(
      { error: "bounties must be an array" },
      { status: 400 }
    );
  }

  const service = getSyncService();
  const result = await service.syncOpenBounties(bounties);

  return NextResponse.json({
    ok: true,
    ...result,
    totalListings: service.getStats().totalListings,
  });
}

// ─── DELETE: Cancel a listing ────────────────────────────────

export async function DELETE(req: NextRequest): Promise<NextResponse> {
  const auth = verifyApiKey(req.headers.get("x-api-key") || "");
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const dTag = req.nextUrl.searchParams.get("dTag");
  if (!dTag) {
    return NextResponse.json(
      { error: "Missing dTag query parameter" },
      { status: 400 }
    );
  }

  const service = getSyncService();
  const cancelled = await service.cancelListing(dTag);

  return NextResponse.json({
    ok: cancelled,
    dTag,
    message: cancelled ? "Listing cancelled" : "No listing found for dTag",
  });
}
