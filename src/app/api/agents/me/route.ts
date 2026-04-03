/**
 * GET /api/agents/me — Current agent identity + stats
 *
 * Returns the authenticated agent's pubkey, bounties posted,
 * applications submitted, and bounties won.
 */

import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/server/auth";
import { getDB } from "@/lib/server/db";

export async function GET(request: NextRequest) {
  const agent = authenticateRequest(request);
  if (!agent) {
    return NextResponse.json(
      { error: "Unauthorized. Provide X-API-Key header." },
      { status: 401 },
    );
  }

  try {
    const db = getDB();

    // Count bounties posted by this agent
    const posted = db
      .prepare("SELECT COUNT(*) as count FROM bounty_events WHERE pubkey = ?")
      .get(agent.pubkey) as { count: number };

    // Count bounties won
    const won = db
      .prepare("SELECT COUNT(*) as count FROM bounty_events WHERE winner_pubkey = ?")
      .get(agent.pubkey) as { count: number };

    // Count applications submitted
    const applied = db
      .prepare("SELECT COUNT(*) as count FROM bounty_applications WHERE applicant_pubkey = ?")
      .get(agent.pubkey) as { count: number };

    // Sum sats earned (won bounties)
    const earned = db
      .prepare("SELECT COALESCE(SUM(reward_sats), 0) as total FROM bounty_events WHERE winner_pubkey = ? AND status = 'COMPLETED'")
      .get(agent.pubkey) as { total: number };

    // Sum sats posted
    const posted_sats = db
      .prepare("SELECT COALESCE(SUM(reward_sats), 0) as total FROM bounty_events WHERE pubkey = ?")
      .get(agent.pubkey) as { total: number };

    return NextResponse.json({
      pubkey: agent.pubkey,
      stats: {
        bounties_posted: posted.count,
        bounties_won: won.count,
        applications: applied.count,
        sats_earned: earned.total,
        sats_posted: posted_sats.total,
      },
    });
  } catch (error) {
    console.error("[agents/me] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
