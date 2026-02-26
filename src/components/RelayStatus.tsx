"use client";

import { useState, useEffect } from "react";
import { getNDKSync } from "@/lib/nostr/ndk";

export default function RelayStatus() {
  const [connected, setConnected] = useState<number>(0);
  const [total, setTotal] = useState<number>(0);

  useEffect(() => {
    const interval = setInterval(() => {
      const ndk = getNDKSync();
      if (!ndk) return;

      const pool = ndk.pool;
      const relays = pool?.relays;
      if (!relays) return;

      setTotal(relays.size);
      let conn = 0;
      relays.forEach((relay) => {
        if (relay.connectivity?.status === 1) conn++;
      });
      setConnected(conn);
    }, 3000);

    return () => clearInterval(interval);
  }, []);

  if (total === 0) return null;

  const color =
    connected === 0
      ? "text-red-400"
      : connected < total
        ? "text-yellow-400"
        : "text-green-400";

  return (
    <span className={`text-xs ${color}`}>
      ● {connected}/{total} relays
    </span>
  );
}
