import { NextResponse } from "next/server";
import { getDB, getBountyStats } from "@/lib/server/db";
import { getPaymentStats } from "@/lib/server/payments";

/**
 * GET /api/admin/stats — Admin dashboard statistics
 *
 * Returns aggregate stats for bounties, payments, and platform activity.
 * Protected by ADMIN_SECRET header in production.
 */
export async function GET(request: Request) {
  const adminSecret = process.env.ADMIN_SECRET;
  if (adminSecret) {
    const auth = request.headers.get("x-admin-secret");
    if (auth !== adminSecret) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  try {
    const db = getDB();
    const bountyStats = getBountyStats();
    const paymentStats = await getPaymentStats();

    // API key stats
    const keyStats = db
      .prepare(
        `SELECT
          count(*) as total_keys,
          count(CASE WHEN last_used_at IS NOT NULL THEN 1 END) as active_keys
        FROM api_keys`
      )
      .get() as Record<string, number>;

    // Toku listing stats
    const tokuStats = db
      .prepare(
        `SELECT
          count(*) as total_listings,
          count(CASE WHEN status = 'active' THEN 1 END) as active,
          count(CASE WHEN status = 'completed' THEN 1 END) as completed,
          count(CASE WHEN status = 'cancelled' THEN 1 END) as cancelled
        FROM toku_listings`
      )
      .get() as Record<string, number>;

    // Recent activity (last 24h) — bounty_events.created_at is unix timestamp
    const oneDayAgo = Math.floor(Date.now() / 1000) - 86400;
    const recentBounties = db
      .prepare(
        `SELECT count(*) as cnt FROM bounty_events WHERE created_at > ?`
      )
      .get(oneDayAgo) as { cnt: number };

    return NextResponse.json({
      timestamp: new Date().toISOString(),
      bounties: {
        total: bountyStats.total,
        open: bountyStats.open,
        in_progress: bountyStats.in_progress,
        completed: bountyStats.completed,
        total_reward_sats: bountyStats.total_sats,
        total_reward_btc: (bountyStats.total_sats / 1e8).toFixed(8),
      },
      payments: {
        total: paymentStats.total,
        pending: paymentStats.pending,
        funded: paymentStats.funded,
        paid: paymentStats.paid,
        failed: paymentStats.failed,
        total_volume_sats: paymentStats.totalVolumeSats,
        total_volume_btc: (paymentStats.totalVolumeSats / 1e8).toFixed(8),
        total_fees_sats: paymentStats.totalFeesSats,
        total_fees_btc: (paymentStats.totalFeesSats / 1e8).toFixed(8),
      },
      api_keys: keyStats,
      toku_listings: tokuStats,
      activity_24h: {
        bounties: recentBounties.cnt,
      },
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
