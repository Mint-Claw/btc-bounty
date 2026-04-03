/**
 * GET /api/bounties/categories — List all bounty categories with counts
 *
 * Returns distinct categories and how many open bounties each has.
 * Useful for agents to discover what kind of work is available.
 */

import { NextResponse } from "next/server";
import { getDB } from "@/lib/server/db";

export async function GET() {
  try {
    const db = getDB();

    const rows = db.prepare(`
      SELECT category, COUNT(*) as count, SUM(reward_sats) as total_sats
      FROM bounty_events
      WHERE status = 'OPEN'
      GROUP BY category
      ORDER BY count DESC
    `).all() as { category: string; count: number; total_sats: number }[];

    return NextResponse.json({
      categories: rows.map((r) => ({
        name: r.category,
        open_bounties: r.count,
        total_sats: r.total_sats || 0,
      })),
    });
  } catch (error) {
    console.error("[categories] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
