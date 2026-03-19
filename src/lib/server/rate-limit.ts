/**
 * In-memory sliding-window rate limiter.
 *
 * Tracks request counts per key (usually IP) within a sliding window.
 * No external dependencies — suitable for single-instance deployments.
 *
 * Usage:
 *   const limiter = createRateLimiter({ windowMs: 60_000, max: 30 });
 *   const { ok, remaining, resetMs } = limiter.check("1.2.3.4");
 *   if (!ok) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
 */

interface RateLimitConfig {
  /** Window size in milliseconds (default: 60s) */
  windowMs?: number;
  /** Max requests per window (default: 30) */
  max?: number;
  /** Cleanup interval in ms — prune expired entries (default: 5 min) */
  cleanupMs?: number;
}

interface RateLimitResult {
  ok: boolean;
  remaining: number;
  resetMs: number;
  total: number;
}

interface RateLimitEntry {
  timestamps: number[];
}

export function createRateLimiter(config: RateLimitConfig = {}) {
  const windowMs = config.windowMs ?? 60_000;
  const max = config.max ?? 30;
  const cleanupMs = config.cleanupMs ?? 300_000;

  const store = new Map<string, RateLimitEntry>();

  // Periodic cleanup of stale entries
  const cleanup = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of store) {
      entry.timestamps = entry.timestamps.filter((t) => now - t < windowMs);
      if (entry.timestamps.length === 0) store.delete(key);
    }
  }, cleanupMs);

  // Don't block process exit
  if (cleanup.unref) cleanup.unref();

  return {
    check(key: string): RateLimitResult {
      const now = Date.now();
      let entry = store.get(key);

      if (!entry) {
        entry = { timestamps: [] };
        store.set(key, entry);
      }

      // Remove timestamps outside the window
      entry.timestamps = entry.timestamps.filter((t) => now - t < windowMs);

      const total = entry.timestamps.length;
      const ok = total < max;

      if (ok) {
        entry.timestamps.push(now);
      }

      // Time until the oldest request expires
      const resetMs =
        entry.timestamps.length > 0
          ? windowMs - (now - entry.timestamps[0])
          : windowMs;

      return {
        ok,
        remaining: Math.max(0, max - entry.timestamps.length),
        resetMs,
        total: entry.timestamps.length,
      };
    },

    /** Reset a specific key (e.g., after successful auth) */
    reset(key: string) {
      store.delete(key);
    },

    /** Current number of tracked keys */
    get size() {
      return store.size;
    },
  };
}

// Pre-configured limiters for different endpoints
export const apiLimiter = createRateLimiter({ windowMs: 60_000, max: 60 });
export const authLimiter = createRateLimiter({ windowMs: 60_000, max: 10 });
export const webhookLimiter = createRateLimiter({ windowMs: 60_000, max: 100 });
