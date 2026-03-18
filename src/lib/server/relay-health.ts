/**
 * Relay Health Check — Server-side Nostr relay connectivity testing.
 *
 * Tests WebSocket connectivity and NIP-11 info document for each relay.
 * Used by /api/health and /api/admin/relay-status endpoints.
 */

import { DEFAULT_RELAYS } from "@/constants/relays";

export interface RelayHealth {
  url: string;
  status: "online" | "offline" | "degraded";
  latencyMs: number | null;
  nip11: Nip11Info | null;
  error?: string;
  checkedAt: string;
}

interface Nip11Info {
  name?: string;
  description?: string;
  supported_nips?: number[];
  software?: string;
  version?: string;
  limitation?: {
    max_message_length?: number;
    max_event_tags?: number;
    max_content_length?: number;
    auth_required?: boolean;
    payment_required?: boolean;
  };
}

// Cache relay health for 60 seconds
let healthCache: { results: RelayHealth[]; timestamp: number } | null = null;
const CACHE_TTL_MS = 60_000;

/**
 * Fetch NIP-11 info document from a relay.
 * Relays serve JSON at their HTTP endpoint with Accept: application/nostr+json
 */
async function fetchNip11(relayUrl: string, timeoutMs = 5000): Promise<Nip11Info | null> {
  const httpUrl = relayUrl.replace("wss://", "https://").replace("ws://", "http://");

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    const res = await fetch(httpUrl, {
      headers: { Accept: "application/nostr+json" },
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (!res.ok) return null;
    return (await res.json()) as Nip11Info;
  } catch {
    return null;
  }
}

/**
 * Test WebSocket connectivity to a relay.
 * Opens a connection, waits for open event, then closes.
 */
async function testWebSocket(
  relayUrl: string,
  timeoutMs = 5000
): Promise<{ ok: boolean; latencyMs: number; error?: string }> {
  // Node.js 18+ has built-in WebSocket, but use dynamic import for compatibility
  const start = Date.now();

  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      resolve({ ok: false, latencyMs: Date.now() - start, error: "timeout" });
    }, timeoutMs);

    try {
      const ws = new WebSocket(relayUrl);

      ws.onopen = () => {
        clearTimeout(timer);
        const latency = Date.now() - start;
        ws.close();
        resolve({ ok: true, latencyMs: latency });
      };

      ws.onerror = (e) => {
        clearTimeout(timer);
        ws.close();
        resolve({
          ok: false,
          latencyMs: Date.now() - start,
          error: e instanceof Error ? e.message : "connection failed",
        });
      };
    } catch (e) {
      clearTimeout(timer);
      resolve({
        ok: false,
        latencyMs: Date.now() - start,
        error: e instanceof Error ? e.message : "WebSocket error",
      });
    }
  });
}

/**
 * Check health of a single relay.
 */
async function checkRelay(relayUrl: string): Promise<RelayHealth> {
  const [wsResult, nip11] = await Promise.all([
    testWebSocket(relayUrl),
    fetchNip11(relayUrl),
  ]);

  let status: RelayHealth["status"] = "offline";
  if (wsResult.ok && nip11) {
    status = "online";
  } else if (wsResult.ok || nip11) {
    status = "degraded";
  }

  return {
    url: relayUrl,
    status,
    latencyMs: wsResult.ok ? wsResult.latencyMs : null,
    nip11,
    ...(wsResult.error && { error: wsResult.error }),
    checkedAt: new Date().toISOString(),
  };
}

/**
 * Check all configured relays. Returns cached results if fresh.
 */
export async function checkAllRelays(
  forceRefresh = false
): Promise<RelayHealth[]> {
  if (!forceRefresh && healthCache && Date.now() - healthCache.timestamp < CACHE_TTL_MS) {
    return healthCache.results;
  }

  const relays = DEFAULT_RELAYS;
  const results = await Promise.all(relays.map((r) => checkRelay(r)));

  healthCache = { results, timestamp: Date.now() };
  return results;
}

/**
 * Get summary stats from relay health results.
 */
export function relayHealthSummary(results: RelayHealth[]) {
  const online = results.filter((r) => r.status === "online").length;
  const degraded = results.filter((r) => r.status === "degraded").length;
  const offline = results.filter((r) => r.status === "offline").length;
  const avgLatency =
    results
      .filter((r) => r.latencyMs !== null)
      .reduce((sum, r) => sum + (r.latencyMs ?? 0), 0) /
    (results.filter((r) => r.latencyMs !== null).length || 1);

  return {
    total: results.length,
    online,
    degraded,
    offline,
    healthy: online + degraded >= Math.ceil(results.length / 2),
    avgLatencyMs: Math.round(avgLatency),
  };
}
