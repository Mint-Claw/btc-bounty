import { NextResponse } from "next/server";
import { DEFAULT_RELAYS } from "@/constants/relays";

interface RelayStatus {
  url: string;
  connected: boolean;
  latencyMs: number | null;
  error?: string;
}

/**
 * Ping a single Nostr relay via WebSocket handshake.
 * Sends a REQ for a nonexistent event to verify protocol support.
 * Times out after 5 seconds.
 */
async function pingRelay(url: string): Promise<RelayStatus> {
  const start = Date.now();

  return new Promise<RelayStatus>((resolve) => {
    const timeout = setTimeout(() => {
      try {
        ws.close();
      } catch {
        /* ignore */
      }
      resolve({ url, connected: false, latencyMs: null, error: "timeout" });
    }, 5000);

    let ws: import("ws").WebSocket;

    try {
      // Dynamic import — ws is a Node.js-only module
      const { WebSocket } = require("ws") as typeof import("ws");
      ws = new WebSocket(url);

      ws.on("open", () => {
        // Send a minimal REQ to verify Nostr protocol
        const subId = `ping_${Date.now()}`;
        ws.send(JSON.stringify(["REQ", subId, { limit: 1, kinds: [0], authors: ["0".repeat(64)] }]));
      });

      ws.on("message", (data: Buffer | string) => {
        const latencyMs = Date.now() - start;
        clearTimeout(timeout);
        // Got a response (likely EOSE) — relay is alive and speaks Nostr
        try {
          ws.send(JSON.stringify(["CLOSE", `ping_${Date.now()}`]));
          ws.close();
        } catch {
          /* ignore */
        }
        resolve({ url, connected: true, latencyMs });
      });

      ws.on("error", (err: Error) => {
        clearTimeout(timeout);
        resolve({
          url,
          connected: false,
          latencyMs: null,
          error: err.message,
        });
      });
    } catch (err) {
      clearTimeout(timeout);
      resolve({
        url,
        connected: false,
        latencyMs: null,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });
}

/**
 * GET /api/relays/status — Check connectivity to all configured Nostr relays.
 *
 * Returns per-relay connection status and latency.
 * Useful for deployment monitoring and relay health dashboards.
 */
export async function GET() {
  const relays = DEFAULT_RELAYS;

  // Ping all relays in parallel
  const results = await Promise.all(relays.map(pingRelay));

  const connected = results.filter((r) => r.connected).length;
  const avgLatency =
    connected > 0
      ? Math.round(
          results
            .filter((r) => r.latencyMs !== null)
            .reduce((sum, r) => sum + (r.latencyMs ?? 0), 0) / connected
        )
      : null;

  return NextResponse.json({
    timestamp: new Date().toISOString(),
    total: relays.length,
    connected,
    disconnected: relays.length - connected,
    avgLatencyMs: avgLatency,
    relays: results,
  });
}
