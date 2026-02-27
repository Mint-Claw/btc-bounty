"use client";

import { useState, useEffect, useCallback } from "react";
import { hasNIP07, getPublicKey, NIP07Error } from "@/lib/nostr/nip07";

export function useNIP07() {
  const [pubkey, setPubkey] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [hasExtension, setHasExtension] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => setHasExtension(hasNIP07()), 300);
    return () => clearTimeout(timer);
  }, []);

  const connect = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const pk = await getPublicKey();
      setPubkey(pk);
    } catch (e) {
      if (e instanceof NIP07Error) {
        setError(e.message);
      } else {
        setError("Failed to connect");
      }
    } finally {
      setLoading(false);
    }
  }, []);

  const disconnect = useCallback(() => {
    setPubkey(null);
  }, []);

  return { pubkey, hasExtension, loading, error, connect, disconnect };
}
