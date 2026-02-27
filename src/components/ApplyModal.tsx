"use client";

import { useState } from "react";
import type { Bounty } from "@/lib/nostr/schema";
import { signEvent } from "@/lib/nostr/nip07";
import NIP07Guard from "./NIP07Guard";

export default function ApplyModal({
  bounty,
  onClose,
}: {
  bounty: Bounty;
  onClose: () => void;
}) {
  const [pitch, setPitch] = useState("");
  const [lightning, setLightning] = useState("");
  const [status, setStatus] = useState<
    "idle" | "signing" | "published" | "error"
  >("idle");

  const handleApply = async () => {
    if (!pitch.trim() || !lightning.trim()) return;

    setStatus("signing");
    try {
      const content = `${pitch}\n\nLightning: ${lightning}`;
      const event = {
        kind: 1,
        content,
        tags: [
          ["e", bounty.id, "", "reply"],
          ["p", bounty.pubkey],
          ["lightning", lightning],
        ],
        created_at: Math.floor(Date.now() / 1000),
      };

      const signed = await signEvent(event);

      // Publish via NDK
      const { getNDK } = await import("@/lib/nostr/ndk");
      const ndk = await getNDK();
      const { NDKEvent } = await import("@nostr-dev-kit/ndk");
      const ndkEvent = new NDKEvent(ndk);
      ndkEvent.kind = signed.kind;
      ndkEvent.content = signed.content;
      ndkEvent.tags = signed.tags;
      ndkEvent.created_at = signed.created_at;
      ndkEvent.pubkey = signed.pubkey;
      ndkEvent.id = signed.id;
      ndkEvent.sig = signed.sig;
      await ndkEvent.publish();

      setStatus("published");
    } catch (e) {
      console.error("Apply failed:", e);
      setStatus("error");
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-zinc-900 border border-zinc-700 rounded-xl max-w-lg w-full p-6">
        {status === "published" ? (
          <div className="text-center py-4">
            <div className="text-4xl mb-3">✅</div>
            <h3 className="text-lg font-bold text-green-400 mb-2">
              Application Sent!
            </h3>
            <p className="text-zinc-400 text-sm mb-4">
              Your application has been published to NOSTR relays.
            </p>
            <button
              onClick={onClose}
              className="px-4 py-2 bg-zinc-800 text-zinc-300 rounded hover:bg-zinc-700 transition"
            >
              Close
            </button>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-zinc-100">
                Apply to Bounty
              </h3>
              <button
                onClick={onClose}
                className="text-zinc-500 hover:text-zinc-300"
              >
                ✕
              </button>
            </div>

            <div className="bg-orange-500/10 border border-orange-500/20 rounded p-3 mb-4 text-sm text-orange-300">
              ⚠️ Your application and Lightning address will be published
              publicly on NOSTR relays. Anyone can read them.
            </div>

            <NIP07Guard>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-zinc-400 mb-1">
                    Your Pitch *
                  </label>
                  <textarea
                    rows={4}
                    value={pitch}
                    onChange={(e) => setPitch(e.target.value)}
                    placeholder="Why you're the right person for this bounty..."
                    className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded text-zinc-100 placeholder-zinc-600 focus:border-orange-500 focus:outline-none resize-y"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-zinc-400 mb-1">
                    Your Lightning Address *
                  </label>
                  <input
                    type="text"
                    value={lightning}
                    onChange={(e) => setLightning(e.target.value)}
                    placeholder="you@getalby.com"
                    className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded text-zinc-100 placeholder-zinc-600 focus:border-orange-500 focus:outline-none"
                  />
                </div>

                <button
                  onClick={handleApply}
                  disabled={
                    !pitch.trim() ||
                    !lightning.trim() ||
                    status === "signing"
                  }
                  className="w-full py-3 bg-orange-500 text-black rounded-lg font-bold hover:bg-orange-400 transition disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {status === "signing"
                    ? "Signing with NIP-07..."
                    : "⚡ Submit Application"}
                </button>

                {status === "error" && (
                  <p className="text-red-400 text-sm text-center">
                    Failed to submit. Check console.
                  </p>
                )}
              </div>
            </NIP07Guard>
          </>
        )}
      </div>
    </div>
  );
}
