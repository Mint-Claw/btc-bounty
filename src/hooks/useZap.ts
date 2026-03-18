"use client";

import { useState, useCallback } from "react";
import {
  executeZap,
  resolveLightningAddress,
  type ZapResult,
} from "../lib/nostr/zaps";
import { DEFAULT_RELAYS } from "../constants/relays";

export interface UseZapOptions {
  recipientPubkey: string;
  lightningAddress: string;
  eventId?: string; // bounty event id
}

export interface UseZapReturn {
  zap: (amountSats: number, comment?: string) => Promise<ZapResult>;
  loading: boolean;
  error: string | null;
  lastResult: ZapResult | null;
  canZap: boolean | null; // null = unknown, checking
  checkCanZap: () => Promise<boolean>;
}

export function useZap(opts: UseZapOptions): UseZapReturn {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<ZapResult | null>(null);
  const [canZap, setCanZap] = useState<boolean | null>(null);

  const checkCanZap = useCallback(async () => {
    if (!opts.lightningAddress) {
      setCanZap(false);
      return false;
    }
    const data = await resolveLightningAddress(opts.lightningAddress);
    const ok = !!data?.allowsNostr;
    setCanZap(ok);
    return ok;
  }, [opts.lightningAddress]);

  const zap = useCallback(
    async (amountSats: number, comment?: string): Promise<ZapResult> => {
      setLoading(true);
      setError(null);

      try {
        const result = await executeZap(opts.lightningAddress, {
          recipientPubkey: opts.recipientPubkey,
          amountMsats: amountSats * 1000,
          content: comment,
          eventId: opts.eventId,
          relays: DEFAULT_RELAYS,
        });

        setLastResult(result);
        if (!result.success && result.error !== "Manual payment required") {
          setError(result.error ?? "Zap failed");
        }
        return result;
      } catch (err) {
        const msg =
          err instanceof Error ? err.message : "Unknown error during zap";
        setError(msg);
        const result: ZapResult = { success: false, error: msg };
        setLastResult(result);
        return result;
      } finally {
        setLoading(false);
      }
    },
    [opts.lightningAddress, opts.recipientPubkey, opts.eventId]
  );

  return { zap, loading, error, lastResult, canZap, checkCanZap };
}
