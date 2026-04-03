import { NextResponse } from "next/server";
import { listCachedBounties, getCachedBounty, searchCachedBounties, countCachedBounties } from "@/lib/server/db";

/**
 * GET /api/bounties/cached
 *
 * List cached bounty events from local DB.
 * No relay calls — instant response.
 *
 * Query params:
 *   ?status=OPEN         — filter by status
 *   ?category=code       — filter by category
 *   ?min_reward=10000    — minimum reward in sats
 *   ?limit=50            — max results (default 50, max 200)
 *   ?offset=0            — pagination offset
 *   ?d_tag=my-bounty     — get single bounty by d-tag
 *   ?q=search            — text search in title/summary/content
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

    const search = url.searchParams.get("q") || url.searchParams.get("search");
    const status = url.searchParams.get("status") || undefined;
    const category = url.searchParams.get("category") || undefined;
    const minReward = parseInt(url.searchParams.get("min_reward") || "0", 10) || 0;
    const limit = Math.min(parseInt(url.searchParams.get("limit") || "50", 10), 200);
    const offset = Math.max(parseInt(url.searchParams.get("offset") || "0", 10), 0);

    // Text search takes priority
    if (search) {
      const bounties = searchCachedBounties(search, { status, limit });
      return NextResponse.json({
        bounties,
        count: bounties.length,
        query: search,
      });
    }

    const filterOpts = { status, category, minReward };
    const bounties = listCachedBounties({ ...filterOpts, limit, offset });
    const total = countCachedBounties(filterOpts);

    return NextResponse.json({
      bounties,
      count: bounties.length,
      total,
      limit,
      offset,
      hasMore: offset + bounties.length < total,
    });
  } catch (error) {
    console.error("Failed to list cached bounties:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
