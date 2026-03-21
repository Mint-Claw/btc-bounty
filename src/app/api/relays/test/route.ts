/**
 * POST /api/relays/test — Test relay connectivity
 *
 * Attempts to connect to all configured relays and returns
 * per-relay status with latency measurements.
 *
 * Requires API key authentication.
 */

import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/server/auth";
import { getRelayPool } from "@/lib/server/relay-pool";

interface RelayTestResult {
  url: string;
  reachable: boolean;
  latencyMs: number | null;
  error?: string;
}

export async function POST(request: NextRequest) {
  const identity = authenticateRequest(request);
  if (!identity) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const pool = getRelayPool();
  const health = pool.getHealth();

  const results: RelayTestResult[] = [];
  const start = Date.now();

  for (const relay of health) {
    const relayStart = Date.now();
    try {
      // Attempt connection via pool (reuses existing if healthy)
      await pool.ensureConnected(relay.url);
      results.push({
        url: relay.url,
        reachable: true,
        latencyMs: Date.now() - relayStart,
      });
    } catch (err) {
      results.push({
        url: relay.url,
        reachable: false,
        latencyMs: null,
        error: err instanceof Error ? err.message : "Unknown error",
      });
    }
  }

  const reachable = results.filter((r) => r.reachable).length;
  const totalMs = Date.now() - start;

  return NextResponse.json({
    timestamp: new Date().toISOString(),
    totalRelays: results.length,
    reachable,
    unreachable: results.length - reachable,
    totalTestMs: totalMs,
    results,
  });
}
