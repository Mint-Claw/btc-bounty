/**
 * GET /api/metrics — Prometheus-compatible metrics endpoint
 *
 * Exports counters and gauges in Prometheus text exposition format.
 * Optionally auth-gated via ADMIN_SECRET header.
 *
 * Also supports ?format=json for JSON output.
 */

import { NextRequest, NextResponse } from "next/server";
import { metrics } from "@/lib/server/monitoring";
import { getDB } from "@/lib/server/db";

export async function GET(request: NextRequest) {
  // Optional auth (skip in dev)
  const adminSecret = process.env.ADMIN_SECRET;
  if (adminSecret) {
    const auth = request.headers.get("x-admin-secret");
    if (auth !== adminSecret) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const format = request.nextUrl.searchParams.get("format");

  // Collect live DB gauges
  try {
    const db = getDB();
    const bountyStats = db.prepare(`
      SELECT
        COUNT(*) as total,
        COALESCE(SUM(CASE WHEN status = 'OPEN' THEN 1 ELSE 0 END), 0) as open,
        COALESCE(SUM(CASE WHEN status = 'IN_PROGRESS' THEN 1 ELSE 0 END), 0) as in_progress,
        COALESCE(SUM(CASE WHEN status = 'COMPLETED' THEN 1 ELSE 0 END), 0) as completed,
        COALESCE(SUM(reward_sats), 0) as total_sats
      FROM bounty_events
    `).get() as Record<string, number>;

    metrics.gauge("btcbounty_bounties_total", bountyStats.total);
    metrics.gauge("btcbounty_bounties_open", bountyStats.open);
    metrics.gauge("btcbounty_bounties_in_progress", bountyStats.in_progress);
    metrics.gauge("btcbounty_bounties_completed", bountyStats.completed);
    metrics.gauge("btcbounty_bounties_total_sats", bountyStats.total_sats);

    const paymentStats = db.prepare(`
      SELECT
        COUNT(*) as total,
        COALESCE(SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END), 0) as pending,
        COALESCE(SUM(CASE WHEN status = 'funded' THEN 1 ELSE 0 END), 0) as funded,
        COALESCE(SUM(CASE WHEN status = 'paid' THEN 1 ELSE 0 END), 0) as paid,
        COALESCE(SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END), 0) as failed,
        COALESCE(SUM(CASE WHEN status = 'paid' THEN amount_sats ELSE 0 END), 0) as paid_volume
      FROM bounty_payments
    `).get() as Record<string, number>;

    metrics.gauge("btcbounty_payments_total", paymentStats.total);
    metrics.gauge("btcbounty_payments_pending", paymentStats.pending);
    metrics.gauge("btcbounty_payments_funded", paymentStats.funded);
    metrics.gauge("btcbounty_payments_paid", paymentStats.paid);
    metrics.gauge("btcbounty_payments_failed", paymentStats.failed);
    metrics.gauge("btcbounty_payments_paid_volume_sats", paymentStats.paid_volume);

    const agentCount = (db.prepare("SELECT COUNT(*) as cnt FROM api_keys").get() as { cnt: number }).cnt;
    metrics.gauge("btcbounty_agents_registered", agentCount);
  } catch {
    // DB not available — still export what we have
  }

  // Process uptime
  metrics.gauge("btcbounty_uptime_seconds", Math.floor(process.uptime()));
  metrics.gauge("btcbounty_memory_rss_bytes", process.memoryUsage().rss);
  metrics.gauge("btcbounty_memory_heap_used_bytes", process.memoryUsage().heapUsed);

  const allMetrics = metrics.getAll();

  if (format === "json") {
    return NextResponse.json({
      ...allMetrics,
      timestamp: new Date().toISOString(),
    });
  }

  // Prometheus text format
  const lines: string[] = [];
  lines.push("# HELP btcbounty_uptime_seconds Process uptime in seconds");
  lines.push("# TYPE btcbounty_uptime_seconds gauge");

  for (const [key, value] of Object.entries(allMetrics.gauges)) {
    // Convert label format: name{k=v} → prometheus metric line
    const match = key.match(/^([^{]+)(?:\{(.+)\})?$/);
    if (match) {
      const [, name, labels] = match;
      const labelStr = labels ? `{${labels}}` : "";
      lines.push(`${name}${labelStr} ${value}`);
    }
  }

  for (const [key, value] of Object.entries(allMetrics.counters)) {
    const match = key.match(/^([^{]+)(?:\{(.+)\})?$/);
    if (match) {
      const [, name, labels] = match;
      const labelStr = labels ? `{${labels}}` : "";
      lines.push(`${name}${labelStr} ${value}`);
    }
  }

  return new NextResponse(lines.join("\n") + "\n", {
    headers: {
      "Content-Type": "text/plain; version=0.0.4; charset=utf-8",
      "Cache-Control": "no-cache",
    },
  });
}
