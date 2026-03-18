import { NextResponse } from "next/server";
import { getDB } from "@/lib/server/db";

/**
 * GET /api/admin/stats — Admin dashboard statistics
 *
 * Returns aggregate stats for bounties, payments, and platform activity.
 * Protected by ADMIN_SECRET header in production.
 */
export async function GET(request: Request) {
  // Simple auth check
  const adminSecret = process.env.ADMIN_SECRET;
  if (adminSecret) {
    const auth = request.headers.get("x-admin-secret");
    if (auth !== adminSecret) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  try {
    const db = getDB();

    // Payment stats
    const paymentStats = db
      .prepare(
        `SELECT
          count(*) as total_payments,
          count(CASE WHEN status = 'settled' THEN 1 END) as settled,
          count(CASE WHEN status = 'pending' THEN 1 END) as pending,
          count(CASE WHEN status = 'expired' THEN 1 END) as expired,
          coalesce(sum(CASE WHEN status = 'settled' THEN amount_sats ELSE 0 END), 0) as total_sats_settled
        FROM payments`
      )
      .get() as Record<string, number>;

    // API key stats
    const keyStats = db
      .prepare(
        `SELECT
          count(*) as total_keys,
          count(CASE WHEN revoked_at IS NULL THEN 1 END) as active_keys
        FROM api_keys`
      )
      .get() as Record<string, number>;

    // Toku listing stats
    const tokuStats = db
      .prepare(
        `SELECT
          count(*) as total_listings,
          count(CASE WHEN synced = 1 THEN 1 END) as synced
        FROM toku_listings`
      )
      .get() as Record<string, number>;

    // Recent activity (last 24h)
    const recentPayments = db
      .prepare(
        `SELECT count(*) as cnt
        FROM payments
        WHERE created_at > datetime('now', '-24 hours')`
      )
      .get() as { cnt: number };

    return NextResponse.json({
      timestamp: new Date().toISOString(),
      payments: {
        ...paymentStats,
        total_btc_settled: (paymentStats.total_sats_settled / 1e8).toFixed(8),
      },
      api_keys: keyStats,
      toku_listings: tokuStats,
      activity_24h: {
        payments: recentPayments.cnt,
      },
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}
