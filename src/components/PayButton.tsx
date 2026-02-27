"use client";

import { useState } from "react";
import type { Bounty } from "@/lib/nostr/schema";

interface Props {
  bounty: Bounty;
  winnerLightning?: string;
}

/**
 * Pay Winner button — uses WebLN if available (Alby),
 * otherwise shows the Lightning address for manual payment.
 */
export default function PayButton({ bounty, winnerLightning }: Props) {
  const [paying, setPaying] = useState(false);
  const [paid, setPaid] = useState(false);
  const [error, setError] = useState("");
  const [showManual, setShowManual] = useState(false);

  const lnAddress = winnerLightning || bounty.lightning;

  async function handleWebLNPay() {
    setPaying(true);
    setError("");

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const webln = (window as any).webln;
      if (!webln) {
        setShowManual(true);
        setPaying(false);
        return;
      }

      await webln.enable();

      // Try LNURL pay if the address looks like a Lightning address
      if (lnAddress.includes("@")) {
        // Resolve LNURL from Lightning address
        const [user, domain] = lnAddress.split("@");
        const res = await fetch(
          `https://${domain}/.well-known/lnurlp/${user}`,
        );
        const lnurlData = await res.json();

        if (lnurlData.callback) {
          // Get invoice from callback
          const amountMsats = bounty.rewardSats * 1000;
          const cbRes = await fetch(
            `${lnurlData.callback}?amount=${amountMsats}`,
          );
          const cbData = await cbRes.json();

          if (cbData.pr) {
            await webln.sendPayment(cbData.pr);
            setPaid(true);
            return;
          }
        }
      }

      // Fallback: show manual
      setShowManual(true);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes("rejected") || msg.includes("cancelled")) {
        setError("Payment cancelled.");
      } else {
        setError(msg);
        setShowManual(true);
      }
    } finally {
      setPaying(false);
    }
  }

  if (paid) {
    return (
      <div className="border border-green-500/30 bg-green-500/10 rounded-lg p-4 text-center">
        <span className="text-green-400 font-bold text-lg">
          ⚡ Payment sent!
        </span>
        <p className="text-sm text-zinc-400 mt-1">
          {bounty.rewardSats.toLocaleString()} sats → {lnAddress}
        </p>
      </div>
    );
  }

  return (
    <div>
      {!showManual ? (
        <button
          onClick={handleWebLNPay}
          disabled={paying}
          className="px-6 py-3 bg-orange-500 text-black rounded-lg font-bold hover:bg-orange-400 transition disabled:opacity-50"
        >
          {paying
            ? "Processing..."
            : `⚡ Pay ${bounty.rewardSats.toLocaleString()} sats`}
        </button>
      ) : (
        <div className="border border-zinc-700 rounded-lg p-4 bg-zinc-900/50">
          <h4 className="text-sm font-semibold text-zinc-300 mb-2">
            Manual Lightning Payment
          </h4>
          <p className="text-sm text-zinc-400 mb-2">
            Send{" "}
            <span className="text-orange-400 font-mono font-bold">
              {bounty.rewardSats.toLocaleString()} sats
            </span>{" "}
            to:
          </p>
          <div className="flex items-center gap-2">
            <code className="text-orange-400 bg-zinc-800 px-3 py-2 rounded flex-1 text-sm">
              {lnAddress}
            </code>
            <button
              onClick={() => navigator.clipboard.writeText(lnAddress)}
              className="px-3 py-2 border border-zinc-600 rounded text-sm text-zinc-300 hover:bg-zinc-800"
            >
              Copy
            </button>
          </div>
        </div>
      )}

      {error && (
        <p className="text-red-400 text-sm mt-2">{error}</p>
      )}
    </div>
  );
}
