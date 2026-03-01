"use client";

import { useState, useEffect } from "react";
import type NDK from "@nostr-dev-kit/ndk";

export interface RelayHealth {
  url: string;
  connected: boolean;
}

/**
 * Track relay connection health for the NDK instance.
 * Returns per-relay status and overall connectivity.
 */
export function useRelayHealth(ndk: NDK | null) {
  const [relays, setRelays] = useState<RelayHealth[]>([]);
  const [connectedCount, setConnectedCount] = useState(0);

  useEffect(() => {
    if (!ndk) return;

    const check = () => {
      const pool = ndk.pool;
      const statuses: RelayHealth[] = [];
      let connected = 0;

      for (const [url, relay] of pool.relays) {
        const isConnected = relay.connectivity?.isAvailable() ?? false;
        statuses.push({ url, connected: isConnected });
        if (isConnected) connected++;
      }

      setRelays(statuses);
      setConnectedCount(connected);
    };

    check();
    const interval = setInterval(check, 10_000);
    return () => clearInterval(interval);
  }, [ndk]);

  return {
    relays,
    connectedCount,
    totalCount: relays.length,
    healthy: connectedCount > 0,
  };
}
