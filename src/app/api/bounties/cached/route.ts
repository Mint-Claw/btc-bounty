import { NextResponse } from "next/server";
import { listCachedBounties, getCachedBounty } from "@/lib/server/db";

/**
 * GET /api/bounties/cached
 *
 * List cached bounty events from local DB.
 * No relay calls — instant response.
 *
 * Query params:
 *   ?status=OPEN         — filter by status
 *   ?category=code       — filter by category
 *   ?limit=50            — max results (default 50)
 *   ?offset=0            — pagination offset
 *   ?d_tag=my-bounty     — get single bounty by d-tag
 */
export async function GET(request: Request): Promise<NextResponse> {
  try {
    const url = new URL(request.url);
    const dTag = url.searchParams.get("d_tag");

    if (dTag) {
      const bounty = getCachedBounty(dTag);
      if (!bounty) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }
      return NextResponse.json(bounty);
    }

    const status = url.searchParams.get("status") || undefined;
    const category = url.searchParams.get("category") || undefined;
    const limit = parseInt(url.searchParams.get("limit") || "50", 10);
    const offset = parseInt(url.searchParams.get("offset") || "0", 10);

    const bounties = listCachedBounties({ status, category, limit, offset });

    return NextResponse.json({
      bounties,
      count: bounties.length,
      limit,
      offset,
    });
  } catch (error) {
    console.error("Failed to list cached bounties:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
