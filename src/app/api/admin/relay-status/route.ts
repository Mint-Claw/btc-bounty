import { NextResponse } from "next/server";
import { checkAllRelays, relayHealthSummary } from "@/lib/server/relay-health";

/**
 * GET /api/admin/relay-status — Nostr relay health check
 *
 * Returns connectivity status, latency, and NIP-11 info for all configured relays.
 * Query params:
 *   ?refresh=true — Force fresh check (bypass 60s cache)
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const forceRefresh = url.searchParams.get("refresh") === "true";

  const results = await checkAllRelays(forceRefresh);
  const summary = relayHealthSummary(results);

  return NextResponse.json({
    summary,
    relays: results,
  });
}
