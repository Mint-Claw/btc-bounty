"use client";

import { useState } from "react";
import { usePaymentStatus } from "@/hooks/usePaymentStatus";

/**
 * "Fund with Bitcoin" button for bounty posters.
 *
 * Creates a BTCPay invoice via the API and redirects to the checkout page.
 * Only shown to the bounty owner when the bounty is not yet funded.
 */
export default function FundButton({
  bountyId,
  amountSats,
  ownerPubkey,
  currentPubkey,
}: {
  bountyId: string;
  amountSats: number;
  ownerPubkey: string;
  currentPubkey: string | null;
}) {
  const { funded, paid } = usePaymentStatus(bountyId);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Only show to the bounty owner
  if (!currentPubkey || currentPubkey !== ownerPubkey) return null;

  // Already funded or paid
  if (funded || paid) return null;

  const handleFund = async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/bounties/${bountyId}/fund`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amountSats }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Failed to create invoice (${res.status})`);
      }

      const { checkoutUrl } = await res.json();
      if (checkoutUrl) {
        window.location.href = checkoutUrl;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create invoice");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-1">
      <button
        onClick={handleFund}
        disabled={loading}
        className="inline-flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-orange-500 hover:bg-orange-600 text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {loading ? (
          <>
            <span className="animate-spin">⏳</span>
            Creating invoice...
          </>
        ) : (
          <>
            ₿ Fund with Bitcoin
            <span className="text-xs opacity-75">
              ({amountSats.toLocaleString()} sats)
            </span>
          </>
        )}
      </button>
      {error && (
        <p className="text-xs text-red-400">{error}</p>
      )}
    </div>
  );
}
