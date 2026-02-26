"use client";

import { hasNIP07 } from "@/lib/nostr/nip07";
import { useState, useEffect, type ReactNode } from "react";

/**
 * Wraps actions that require a NIP-07 extension.
 * Shows install prompt if no extension detected.
 */
export default function NIP07Guard({
  children,
  fallback,
}: {
  children: ReactNode;
  fallback?: ReactNode;
}) {
  const [hasExtension, setHasExtension] = useState<boolean | null>(null);

  useEffect(() => {
    // Check after a short delay — extensions inject async
    const timer = setTimeout(() => setHasExtension(hasNIP07()), 200);
    return () => clearTimeout(timer);
  }, []);

  if (hasExtension === null) return null; // Loading
  if (hasExtension) return <>{children}</>;

  return (
    fallback ?? (
      <div className="border border-orange-500/30 rounded-lg p-6 bg-orange-500/5 text-center">
        <h3 className="text-lg font-semibold text-orange-400 mb-2">
          NOSTR Extension Required
        </h3>
        <p className="text-sm text-zinc-400 mb-4">
          A NOSTR browser extension is needed to sign events.
        </p>
        <div className="flex gap-3 justify-center">
          <a
            href="https://getalby.com"
            target="_blank"
            rel="noopener noreferrer"
            className="px-4 py-2 bg-orange-500 text-black rounded font-medium text-sm hover:bg-orange-400 transition"
          >
            Get Alby (recommended)
          </a>
          <a
            href="https://chrome.google.com/webstore/detail/nos2x/kpgefcfmnafjgpblomihpgcdllhdemfc"
            target="_blank"
            rel="noopener noreferrer"
            className="px-4 py-2 border border-zinc-700 text-zinc-300 rounded text-sm hover:border-zinc-500 transition"
          >
            nos2x (Chrome)
          </a>
        </div>
      </div>
    )
  );
}
