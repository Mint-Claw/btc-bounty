/**
 * Hook to fetch payment/funding status for bounties.
 *
 * Batches bounty IDs into a single API call and caches results.
 * Used by BountyCard to show "⚡ FUNDED" badge.
 */

import { useState, useEffect, useRef } from "react";

interface PaymentStatus {
  funded: boolean;
  paid: boolean;
}

interface PaymentStatusCache {
  statuses: Record<string, PaymentStatus>;
  fetchedAt: number;
}

// Module-level cache to avoid refetching on re-render
const cache: PaymentStatusCache = { statuses: {}, fetchedAt: 0 };
const CACHE_TTL_MS = 30_000; // 30 seconds

/**
 * Fetch payment statuses for a batch of bounty IDs.
 */
async function fetchStatuses(
  bountyIds: string[],
): Promise<Record<string, PaymentStatus>> {
  if (bountyIds.length === 0) return {};

  try {
    const res = await fetch(
      `/api/payments/status?bountyIds=${bountyIds.join(",")}`,
    );
    if (!res.ok) return {};
    const data = await res.json();
    return data.statuses || {};
  } catch {
    return {};
  }
}

/**
 * Hook: get payment status for a single bounty.
 *
 * Returns { funded, paid, loading }.
 */
export function usePaymentStatus(bountyId: string): {
  funded: boolean;
  paid: boolean;
  loading: boolean;
} {
  const [status, setStatus] = useState<PaymentStatus | null>(
    cache.statuses[bountyId] || null,
  );
  const [loading, setLoading] = useState(!cache.statuses[bountyId]);

  useEffect(() => {
    // Check cache — skip fetch if fresh
    const cached = cache.statuses[bountyId];
    const isFresh = cached && Date.now() - cache.fetchedAt < CACHE_TTL_MS;
    if (isFresh) return;

    // Fetch fresh status
    let cancelled = false;
    fetchStatuses([bountyId]).then((result) => {
      if (cancelled) return;
      if (result[bountyId]) {
        cache.statuses[bountyId] = result[bountyId];
        cache.fetchedAt = Date.now();
        setStatus(result[bountyId]);
      } else {
        setStatus({ funded: false, paid: false });
      }
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [bountyId]);

  return {
    funded: status?.funded ?? false,
    paid: status?.paid ?? false,
    loading,
  };
}

/**
 * Hook: batch-fetch payment statuses for multiple bounties.
 *
 * Use in list views to make a single API call for all visible bounties.
 */
export function useBatchPaymentStatus(bountyIds: string[]): {
  statuses: Record<string, PaymentStatus>;
  loading: boolean;
} {
  const [statuses, setStatuses] = useState<Record<string, PaymentStatus>>({});
  const [loading, setLoading] = useState(true);
  const prevIds = useRef<string>("");

  useEffect(() => {
    const key = bountyIds.sort().join(",");
    if (key === prevIds.current) return;
    prevIds.current = key;

    // Check which IDs need fetching
    const stale = Date.now() - cache.fetchedAt > CACHE_TTL_MS;
    const uncached = stale
      ? bountyIds
      : bountyIds.filter((id) => !cache.statuses[id]);

    if (uncached.length === 0) return;

    let cancelled = false;
    fetchStatuses(uncached).then((result) => {
      if (cancelled) return;
      // Merge into cache
      for (const [id, s] of Object.entries(result)) {
        cache.statuses[id] = s;
      }
      cache.fetchedAt = Date.now();

      // Build full result
      const full: Record<string, PaymentStatus> = {};
      for (const id of bountyIds) {
        full[id] = cache.statuses[id] || { funded: false, paid: false };
      }
      setStatuses(full);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [bountyIds]);

  return { statuses, loading };
}
