"use client";

import { useState } from "react";
import type { Bounty, BountyApplication } from "@/lib/nostr/schema";
import { updateBountyStatus } from "@/lib/nostr/bounty";

interface Props {
  bounty: Bounty;
  applications: BountyApplication[];
  onClose: () => void;
  onComplete: () => void;
}

export default function MarkCompleteModal({
  bounty,
  applications,
  onClose,
  onComplete,
}: Props) {
  const [winner, setWinner] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit() {
    if (!winner) {
      setError("Select a winner or paste their npub/hex pubkey.");
      return;
    }
    setSubmitting(true);
    setError("");

    try {
      await updateBountyStatus(bounty, "COMPLETED", winner);
      onComplete();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update bounty.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-zinc-900 border border-zinc-700 rounded-xl w-full max-w-lg p-6">
        <h2 className="text-xl font-bold text-zinc-100 mb-4">
          ✅ Mark Bounty Complete
        </h2>

        <p className="text-sm text-zinc-400 mb-4">
          Select the winner who completed the work. This publishes an updated
          event marking the bounty as COMPLETED.
        </p>

        {/* Applicant picker */}
        {applications.length > 0 && (
          <div className="mb-4">
            <label className="block text-sm font-medium text-zinc-300 mb-2">
              Select Winner
            </label>
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {applications.map((app) => (
                <label
                  key={app.id}
                  className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition ${
                    winner === app.pubkey
                      ? "border-orange-500 bg-orange-500/10"
                      : "border-zinc-700 hover:border-zinc-500"
                  }`}
                >
                  <input
                    type="radio"
                    name="winner"
                    value={app.pubkey}
                    checked={winner === app.pubkey}
                    onChange={() => setWinner(app.pubkey)}
                    className="accent-orange-500"
                  />
                  <div className="flex-1 min-w-0">
                    <code className="text-xs text-zinc-400">
                      {app.pubkey.slice(0, 16)}...
                    </code>
                    <p className="text-sm text-zinc-300 truncate">
                      {app.content.slice(0, 80)}
                    </p>
                    {app.lightning && (
                      <span className="text-xs text-orange-400">
                        ⚡ {app.lightning}
                      </span>
                    )}
                  </div>
                </label>
              ))}
            </div>
          </div>
        )}

        {/* Manual entry */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-zinc-300 mb-1">
            Or paste winner pubkey (hex)
          </label>
          <input
            type="text"
            value={winner}
            onChange={(e) => setWinner(e.target.value)}
            placeholder="hex pubkey..."
            className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm text-zinc-200 placeholder-zinc-500 focus:border-orange-500 focus:outline-none"
          />
        </div>

        {error && (
          <p className="text-red-400 text-sm mb-4">{error}</p>
        )}

        <div className="flex gap-3 justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 text-zinc-400 hover:text-zinc-200"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="px-6 py-2 bg-green-600 text-white rounded-lg font-bold hover:bg-green-500 transition disabled:opacity-50"
          >
            {submitting ? "Publishing..." : "✅ Confirm Complete"}
          </button>
        </div>
      </div>
    </div>
  );
}
