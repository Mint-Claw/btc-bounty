import { NextResponse } from "next/server";
import { btcpayHealthCheck } from "@/lib/server/btcpay";
import { getPaymentStats } from "@/lib/server/payments";
import { checkAllRelays, relayHealthSummary } from "@/lib/server/relay-health";

/**
 * GET /api/health — System health check
 *
 * Reports status of all subsystems:
 * - BTCPay Server connectivity
 * - Payment statistics
 * - SQLite database status
 * - NOSTR relay configuration
 * - Build/version info
 */
export async function GET() {
  const btcpay = await btcpayHealthCheck();
  const stats = await getPaymentStats();

  // Database health
  let dbStatus: { ok: boolean; tables?: number; error?: string } = { ok: false };
  try {
    const { getDB } = await import("@/lib/server/db");
    const db = getDB();
    const tables = db
      .prepare(
        "SELECT count(*) as cnt FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
      )
      .get() as { cnt: number };
    dbStatus = { ok: true, tables: tables.cnt };
  } catch (e) {
    dbStatus = { ok: false, error: e instanceof Error ? e.message : String(e) };
  }

  // Relay health — actual connectivity check
  const relayResults = await checkAllRelays();
  const relaySummary = relayHealthSummary(relayResults);

  return NextResponse.json({
    status: relaySummary.healthy && dbStatus.ok ? "ok" : "degraded",
    version: process.env.APP_VERSION || process.env.npm_package_version || "0.4.0",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    btcpay: {
      connected: btcpay.ok,
      url: btcpay.url,
      ...(btcpay.error && { error: btcpay.error }),
    },
    database: dbStatus,
    nostr: {
      ...relaySummary,
      relays: relayResults.map((r) => ({
        url: r.url,
        status: r.status,
        latencyMs: r.latencyMs,
      })),
    },
    payments: stats,
    env: {
      node: process.version,
      platform: process.platform,
      app_url: process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
    },
  });
}
