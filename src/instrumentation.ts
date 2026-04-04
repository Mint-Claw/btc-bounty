/**
 * Next.js Instrumentation — runs once on server start.
 *
 * Sets up background tasks:
 * - Auto-sync bounties from NOSTR relays every 5 minutes
 * - Auto-expire stale bounties every hour
 */

export async function register() {
  // Only run on the server (not during build/edge)
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const SYNC_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
  const EXPIRE_INTERVAL_MS = 60 * 60 * 1000; // 1 hour

  console.log("[instrumentation] Starting background tasks...");

  // Delay first sync by 60s to let relay pool fully connect
  setTimeout(async () => {
    try {
      const { syncBounties, syncBountiesIncremental } = await import("@/lib/server/bounty-sync");

      // Initial full sync (since=0) to repopulate cache after restart
      const result = await syncBounties(0, 500);
      console.log(`[auto-sync] Initial: fetched=${result.fetched} cached=${result.cached}`);

      // Periodic incremental sync
      setInterval(async () => {
        try {
          const r = await syncBountiesIncremental(100);
          if (r.cached > 0) {
            console.log(`[auto-sync] Synced: fetched=${r.fetched} cached=${r.cached}`);
          }
        } catch (e) {
          console.error("[auto-sync] Error:", e instanceof Error ? e.message : e);
        }
      }, SYNC_INTERVAL_MS);
    } catch (e) {
      console.error("[auto-sync] Failed to start:", e instanceof Error ? e.message : e);
    }
  }, 60_000);

  // Auto-expire stale bounties
  setTimeout(async () => {
    try {
      const { expireStale } = await import("@/lib/server/expiration");

      setInterval(async () => {
        try {
          const result = await expireStale();
          if (result.expired > 0) {
            console.log(`[auto-expire] Expired ${result.expired} stale bounties`);
          }
        } catch (e) {
          console.error("[auto-expire] Error:", e instanceof Error ? e.message : e);
        }
      }, EXPIRE_INTERVAL_MS);
    } catch (e) {
      console.error("[auto-expire] Failed to start:", e instanceof Error ? e.message : e);
    }
  }, 60_000);
}
