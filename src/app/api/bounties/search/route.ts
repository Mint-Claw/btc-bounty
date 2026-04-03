/**
 * GET /api/bounties/search?q=<query>&status=OPEN&limit=20
 *
 * Full-text search across bounty titles and content using SQLite FTS5.
 * Returns ranked results with snippets.
 */

import { NextRequest, NextResponse } from "next/server";
import { searchCachedBounties } from "@/lib/server/db";

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get("q")?.trim();

  if (!q || q.length < 2) {
    return NextResponse.json(
      { error: "Query parameter 'q' required (min 2 characters)" },
      { status: 400 },
    );
  }

  const status = request.nextUrl.searchParams.get("status") || undefined;
  const limit = Math.min(
    parseInt(request.nextUrl.searchParams.get("limit") || "20", 10),
    50,
  );

  try {
    const results = searchCachedBounties(q, { status, limit });

    return NextResponse.json({
      query: q,
      count: results.length,
      results: results.map((r) => ({
        d_tag: r.d_tag,
        title: r.title,
        summary: r.summary,
        reward_sats: r.reward_sats,
        status: r.status,
        category: r.category,
        created_at: r.created_at,
      })),
    });
  } catch (error) {
    console.error("[search] Error:", error);
    return NextResponse.json(
      { error: "Search failed" },
      { status: 500 },
    );
  }
}
