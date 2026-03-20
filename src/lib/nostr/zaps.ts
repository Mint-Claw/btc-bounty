/**
 * NIP-57 Zap Support — Lightning zaps for bounties and profiles.
 *
 * Flow:
 * 1. Fetch recipient's LNURL/Lightning Address from kind:0 profile
 * 2. Build a NIP-57 zap request event (kind:9734)
 * 3. Send zap request to LNURL callback to get a bolt11 invoice
 * 4. Pay the invoice via WebLN or show QR for manual payment
 *
 * Reference: https://github.com/nostr-protocol/nips/blob/master/57.md
 */

import { type UnsignedEvent } from "nostr-tools/pure";
import { hasWebLN } from "../lightning/webln";

// ── Types ─────────────────────────────────────────────

export interface ZapRequest {
  recipientPubkey: string; // hex pubkey of zap recipient
  amountMsats: number; // amount in millisatoshis
  content?: string; // optional zap comment
  eventId?: string; // optional event to zap (bounty event id)
  relays: string[]; // relays for the zap receipt
}

export interface LNURLPayData {
  callback: string;
  minSendable: number; // msats
  maxSendable: number; // msats
  allowsNostr: boolean;
  nostrPubkey?: string; // hex pubkey of the LNURL provider
  metadata: string;
}

export interface ZapResult {
  success: boolean;
  preimage?: string;
  bolt11?: string; // if manual pay needed
  error?: string;
}

// ── Lightning Address → LNURL ─────────────────────────

/**
 * Resolve a Lightning Address (user@domain) to LNURL pay data.
 */
export async function resolveLightningAddress(
  address: string
): Promise<LNURLPayData | null> {
  const match = address.match(/^([^@]+)@(.+)$/);
  if (!match) return null;

  const [, name, domain] = match;
  const url = `https://${domain}/.well-known/lnurlp/${name}`;

  try {
    const res = await fetch(url, {
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return null;
    const data = await res.json();

    return {
      callback: data.callback,
      minSendable: data.minSendable ?? 1000,
      maxSendable: data.maxSendable ?? 100_000_000_000,
      allowsNostr: !!data.allowsNostr,
      nostrPubkey: data.nostrPubkey,
      metadata: data.metadata ?? "[[\"text/plain\",\"Zap\"]]",
    };
  } catch {
    return null;
  }
}

/**
 * Decode an LNURL (bech32-encoded URL) and fetch pay data.
 */
export async function decodeLNURL(
  lnurl: string
): Promise<LNURLPayData | null> {
  try {
    // LNURL is bech32-encoded — decode to URL
    const decoded = decodeBech32LNURL(lnurl);
    if (!decoded) return null;

    const res = await fetch(decoded, {
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return null;
    const data = await res.json();

    return {
      callback: data.callback,
      minSendable: data.minSendable ?? 1000,
      maxSendable: data.maxSendable ?? 100_000_000_000,
      allowsNostr: !!data.allowsNostr,
      nostrPubkey: data.nostrPubkey,
      metadata: data.metadata ?? "[[\"text/plain\",\"Zap\"]]",
    };
  } catch {
    return null;
  }
}

// ── Zap Request Event (kind:9734) ─────────────────────

/**
 * Build a NIP-57 zap request event (kind:9734).
 * Must be signed by the zapper (sender).
 */
export function buildZapRequestEvent(req: ZapRequest): UnsignedEvent {
  const tags: string[][] = [
    ["p", req.recipientPubkey],
    ["amount", req.amountMsats.toString()],
    ["relays", ...req.relays],
  ];

  if (req.eventId) {
    tags.push(["e", req.eventId]);
  }

  return {
    kind: 9734,
    created_at: Math.floor(Date.now() / 1000),
    tags,
    content: req.content ?? "",
    pubkey: "", // will be set by signer
  };
}

/**
 * Sign a zap request using NIP-07 browser extension.
 */
export async function signZapRequest(
  event: UnsignedEvent
): Promise<{ id: string; sig: string; pubkey: string } | null> {
  if (typeof window === "undefined" || !window.nostr) return null;

  try {
    const signed = await window.nostr.signEvent(event);
    return signed as { id: string; sig: string; pubkey: string };
  } catch {
    return null;
  }
}

// ── Execute Zap ───────────────────────────────────────

/**
 * Full zap flow:
 * 1. Resolve Lightning Address → LNURL pay data
 * 2. Build + sign zap request event
 * 3. Send to LNURL callback → get bolt11
 * 4. Pay via WebLN or return bolt11 for manual payment
 */
export async function executeZap(
  lightningAddress: string,
  req: ZapRequest
): Promise<ZapResult> {
  // 1. Resolve LNURL
  const lnurlData = await resolveLightningAddress(lightningAddress);
  if (!lnurlData) {
    return { success: false, error: "Could not resolve Lightning Address" };
  }

  if (!lnurlData.allowsNostr) {
    return {
      success: false,
      error: "Recipient's Lightning provider doesn't support Nostr zaps",
    };
  }

  // Validate amount
  if (
    req.amountMsats < lnurlData.minSendable ||
    req.amountMsats > lnurlData.maxSendable
  ) {
    return {
      success: false,
      error: `Amount must be between ${lnurlData.minSendable / 1000} and ${lnurlData.maxSendable / 1000} sats`,
    };
  }

  // 2. Build + sign zap request
  const unsigned = buildZapRequestEvent(req);
  const signed = await signZapRequest(unsigned);
  if (!signed) {
    return { success: false, error: "Failed to sign zap request (NIP-07)" };
  }

  // 3. Request invoice from LNURL callback
  const callbackUrl = new URL(lnurlData.callback);
  callbackUrl.searchParams.set("amount", req.amountMsats.toString());
  callbackUrl.searchParams.set("nostr", JSON.stringify(signed));

  try {
    const invoiceRes = await fetch(callbackUrl.toString());
    if (!invoiceRes.ok) {
      return { success: false, error: "LNURL callback failed" };
    }
    const invoiceData = await invoiceRes.json();

    if (!invoiceData.pr) {
      return {
        success: false,
        error: invoiceData.reason ?? "No invoice returned",
      };
    }

    const bolt11: string = invoiceData.pr;

    // 4. Pay via WebLN if available
    if (hasWebLN()) {
      try {
        await window.webln!.enable();
        const { preimage } = await window.webln!.sendPayment(bolt11);
        return { success: true, preimage, bolt11 };
      } catch {
        // WebLN failed — fall through to manual
      }
    }

    // Return bolt11 for manual payment (QR code)
    return { success: false, bolt11, error: "Manual payment required" };
  } catch {
    return { success: false, error: "Network error contacting LNURL provider" };
  }
}

// ── Zap Receipt Validation (kind:9735) ─────────────────

/**
 * Validate a NIP-57 zap receipt event (kind:9735).
 * Returns the embedded zap request if valid.
 */
export function validateZapReceipt(event: {
  kind: number;
  tags: string[][];
  content: string;
  pubkey: string;
}): { valid: boolean; amountMsats?: number; senderPubkey?: string } {
  if (event.kind !== 9735) return { valid: false };

  // Extract the embedded zap request from the "description" tag
  const descTag = event.tags.find((t) => t[0] === "description");
  if (!descTag || !descTag[1]) return { valid: false };

  try {
    const zapRequest = JSON.parse(descTag[1]);
    if (zapRequest.kind !== 9734) return { valid: false };

    const amountTag = zapRequest.tags?.find(
      (t: string[]) => t[0] === "amount"
    );
    const amountMsats = amountTag ? parseInt(amountTag[1], 10) : 0;

    return {
      valid: true,
      amountMsats,
      senderPubkey: zapRequest.pubkey,
    };
  } catch {
    return { valid: false };
  }
}

// ── Utility: Bech32 LNURL decode ──────────────────────

const BECH32_CHARSET = "qpzry9x8gf2tvdw0s3jn54khce6mua7l";

function decodeBech32LNURL(lnurl: string): string | null {
  try {
    const lower = lnurl.toLowerCase();
    if (!lower.startsWith("lnurl1")) return null;

    const data = lower.slice(6);
    const values: number[] = [];

    for (const ch of data) {
      const idx = BECH32_CHARSET.indexOf(ch);
      if (idx === -1) return null;
      values.push(idx);
    }

    // Convert 5-bit groups to 8-bit bytes
    const bytes: number[] = [];
    let acc = 0;
    let bits = 0;

    // Strip checksum (last 6 chars = 30 bits)
    const payload = values.slice(0, -6);

    for (const val of payload) {
      acc = (acc << 5) | val;
      bits += 5;
      while (bits >= 8) {
        bits -= 8;
        bytes.push((acc >> bits) & 0xff);
      }
    }

    return new TextDecoder().decode(new Uint8Array(bytes));
  } catch {
    return null;
  }
}

// NIP-07 types: see src/types/global.d.ts
