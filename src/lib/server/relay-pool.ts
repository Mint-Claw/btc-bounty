/**
 * Persistent relay connection pool with health monitoring and failover.
 *
 * Maintains long-lived WebSocket connections, tracks relay health,
 * and provides automatic failover for publishing and fetching.
 */

import { Relay } from "nostr-tools/relay";
import type { SignedEvent } from "./signing";

/** Relay health status */
interface RelayHealth {
  url: string;
  connected: boolean;
  lastSuccess: number;
  lastFailure: number;
  consecutiveFailures: number;
  totalPublished: number;
  totalFetched: number;
  avgLatencyMs: number;
}

/** Pool configuration */
interface PoolConfig {
  /** Relay URLs */
  relays: string[];
  /** Connection timeout in ms (default: 5000) */
  connectTimeoutMs?: number;
  /** Fetch EOSE timeout in ms (default: 5000) */
  fetchTimeoutMs?: number;
  /** Max consecutive failures before relay is deprioritized (default: 3) */
  maxFailures?: number;
  /** Time to wait before retrying a failed relay in ms (default: 30000) */
  retryBackoffMs?: number;
  /** Min relays to publish to for success (default: 1) */
  minPublishRelays?: number;
}

const DEFAULT_CONFIG: Required<PoolConfig> = {
  relays: (
    process.env.NEXT_PUBLIC_RELAYS ||
    "wss://relay.damus.io,wss://nos.lol,wss://nostr.wine"
  ).split(",").map((s) => s.trim()),
  connectTimeoutMs: 5000,
  fetchTimeoutMs: 5000,
  maxFailures: 3,
  retryBackoffMs: 30_000,
  minPublishRelays: 1,
};

class RelayPool {
  private connections = new Map<string, Relay>();
  private health = new Map<string, RelayHealth>();
  private config: Required<PoolConfig>;
  private connecting = new Map<string, Promise<Relay | null>>();

  constructor(config?: Partial<PoolConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    for (const url of this.config.relays) {
      this.health.set(url, {
        url,
        connected: false,
        lastSuccess: 0,
        lastFailure: 0,
        consecutiveFailures: 0,
        totalPublished: 0,
        totalFetched: 0,
        avgLatencyMs: 0,
      });
    }
  }

  /**
   * Get or establish a connection to a relay.
   * Returns null if connection fails.
   */
  private async getRelay(url: string): Promise<Relay | null> {
    const existing = this.connections.get(url);
    if (existing) return existing;

    // Deduplicate concurrent connection attempts
    const inflight = this.connecting.get(url);
    if (inflight) return inflight;

    const attempt = this.connectRelay(url);
    this.connecting.set(url, attempt);
    try {
      return await attempt;
    } finally {
      this.connecting.delete(url);
    }
  }

  private async connectRelay(url: string): Promise<Relay | null> {
    const h = this.health.get(url)!;

    // Skip if too many recent failures (exponential backoff)
    if (h.consecutiveFailures >= this.config.maxFailures) {
      const backoff = this.config.retryBackoffMs * Math.pow(2, h.consecutiveFailures - this.config.maxFailures);
      if (Date.now() - h.lastFailure < backoff) return null;
    }

    try {
      const relay = await Promise.race([
        Relay.connect(url),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("Connection timeout")), this.config.connectTimeoutMs)
        ),
      ]);

      this.connections.set(url, relay);
      h.connected = true;
      h.consecutiveFailures = 0;
      h.lastSuccess = Date.now();
      return relay;
    } catch {
      h.connected = false;
      h.consecutiveFailures++;
      h.lastFailure = Date.now();
      return null;
    }
  }

  /**
   * Get relays sorted by health (best first).
   */
  private sortedRelays(): string[] {
    return [...this.config.relays].sort((a, b) => {
      const ha = this.health.get(a)!;
      const hb = this.health.get(b)!;
      // Connected relays first
      if (ha.connected !== hb.connected) return ha.connected ? -1 : 1;
      // Fewer failures first
      if (ha.consecutiveFailures !== hb.consecutiveFailures)
        return ha.consecutiveFailures - hb.consecutiveFailures;
      // Lower latency first
      return ha.avgLatencyMs - hb.avgLatencyMs;
    });
  }

  private recordLatency(url: string, ms: number) {
    const h = this.health.get(url)!;
    // Exponential moving average
    h.avgLatencyMs = h.avgLatencyMs === 0 ? ms : h.avgLatencyMs * 0.7 + ms * 0.3;
  }

  /**
   * Publish an event to all healthy relays.
   * Returns the number of relays that accepted it.
   */
  async publish(event: SignedEvent): Promise<number> {
    let published = 0;
    const urls = this.sortedRelays();

    const results = await Promise.allSettled(
      urls.map(async (url) => {
        const relay = await this.getRelay(url);
        if (!relay) return;

        const h = this.health.get(url)!;
        const start = Date.now();
        try {
          await relay.publish(event as Parameters<typeof relay.publish>[0]);
          h.totalPublished++;
          h.lastSuccess = Date.now();
          h.consecutiveFailures = 0;
          this.recordLatency(url, Date.now() - start);
          published++;
        } catch (err) {
          h.consecutiveFailures++;
          h.lastFailure = Date.now();
          console.error(`[relay] Publish to ${url} failed:`, err instanceof Error ? err.message : err);
          // Connection may be dead — remove so it reconnects
          this.connections.delete(url);
          h.connected = false;
        }
      }),
    );

    if (published < this.config.minPublishRelays) {
      const errors = results
        .filter((r) => r.status === "rejected")
        .map((r) => (r as PromiseRejectedResult).reason?.message || "unknown");
      throw new Error(
        `Published to ${published}/${this.config.minPublishRelays} required relays. Errors: ${errors.join(", ")}`,
      );
    }

    return published;
  }

  /**
   * Fetch events matching a filter from the healthiest relay.
   * Falls back to next relay on failure.
   */
  async fetch(filter: Record<string, unknown>): Promise<SignedEvent[]> {
    const urls = this.sortedRelays();

    for (const url of urls) {
      const relay = await this.getRelay(url);
      if (!relay) continue;

      const h = this.health.get(url)!;
      const start = Date.now();

      try {
        const events: SignedEvent[] = [];
        const sub = relay.subscribe(
          [filter as Parameters<typeof relay.subscribe>[0][0]],
          {
            onevent(event) {
              events.push(event as unknown as SignedEvent);
            },
            oneose() {
              sub.close();
            },
          },
        );

        await new Promise<void>((resolve) => {
          const origClose = sub.close.bind(sub);
          let resolved = false;
          sub.close = () => {
            origClose();
            if (!resolved) { resolved = true; resolve(); }
          };
          setTimeout(() => sub.close(), this.config.fetchTimeoutMs);
        });

        h.totalFetched += events.length;
        h.lastSuccess = Date.now();
        h.consecutiveFailures = 0;
        this.recordLatency(url, Date.now() - start);
        return events;
      } catch {
        h.consecutiveFailures++;
        h.lastFailure = Date.now();
        this.connections.delete(url);
        h.connected = false;
        continue;
      }
    }

    return [];
  }

  /**
   * Get health status of all relays.
   */
  getHealth(): RelayHealth[] {
    return [...this.health.values()];
  }

  /**
   * Ensure a specific relay is connected. Used for connectivity testing.
   */
  async ensureConnected(url: string): Promise<void> {
    const existing = this.connections.get(url);
    if (existing) return;
    const relay = await this.connectRelay(url);
    if (!relay) throw new Error(`Failed to connect to ${url}`);
  }

  /**
   * Close all connections.
   */
  async close(): Promise<void> {
    for (const [url, relay] of this.connections) {
      try { relay.close(); } catch { /* ignore */ }
      const h = this.health.get(url);
      if (h) h.connected = false;
    }
    this.connections.clear();
  }
}

/** Singleton pool instance */
let _pool: RelayPool | null = null;

export function getRelayPool(config?: Partial<PoolConfig>): RelayPool {
  if (!_pool) {
    _pool = new RelayPool(config);
  }
  return _pool;
}

export { RelayPool, type RelayHealth, type PoolConfig };
