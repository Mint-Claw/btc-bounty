"use client";

import { usePaymentStatus } from "@/hooks/usePaymentStatus";

/**
 * Shows a "⚡ FUNDED" or "✅ PAID" badge for bounties with escrow.
 *
 * Automatically fetches payment status from the API.
 * Shows nothing if the bounty has no escrow.
 */
export default function FundedBadge({ bountyId }: { bountyId: string }) {
  const { funded, paid, loading } = usePaymentStatus(bountyId);

  if (loading) return null;

  if (paid) {
    return (
      <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded border bg-green-500/20 text-green-400 border-green-500/30 font-medium">
        ✅ PAID
      </span>
    );
  }

  if (funded) {
    return (
      <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded border bg-orange-500/20 text-orange-400 border-orange-500/30 font-medium animate-pulse">
        ⚡ FUNDED
      </span>
    );
  }

  return null;
}
