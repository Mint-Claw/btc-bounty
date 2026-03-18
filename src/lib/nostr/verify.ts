/**
 * Nostr Event Signature Verification
 *
 * Cryptographically verifies Nostr events (NIP-01) using schnorr signatures.
 * Prevents spoofed bounties, applications, and status updates.
 *
 * Verification checks:
 *   1. Event ID matches sha256(serialized event)
 *   2. Schnorr signature is valid for the pubkey
 *   3. Event structure conforms to NIP-01
 *   4. Timestamp is within acceptable range
 */

import { verifyEvent, getEventHash, type Event } from "nostr-tools/pure";

export interface VerificationResult {
  valid: boolean;
  checks: {
    structure: boolean;
    id: boolean;
    signature: boolean;
    timestamp: boolean;
  };
  errors: string[];
  event?: {
    id: string;
    kind: number;
    pubkey: string;
    created_at: number;
  };
}

/** Maximum age for an event to be considered valid (24 hours) */
const MAX_EVENT_AGE_SECONDS = 86400;

/** Maximum future drift allowed (15 minutes) */
const MAX_FUTURE_DRIFT_SECONDS = 900;

/**
 * Validate NIP-01 event structure before crypto checks.
 */
function validateStructure(event: unknown): event is Event {
  if (!event || typeof event !== "object") return false;
  const e = event as Record<string, unknown>;

  return (
    typeof e.id === "string" &&
    /^[0-9a-f]{64}$/.test(e.id) &&
    typeof e.pubkey === "string" &&
    /^[0-9a-f]{64}$/.test(e.pubkey) &&
    typeof e.created_at === "number" &&
    Number.isInteger(e.created_at) &&
    typeof e.kind === "number" &&
    Number.isInteger(e.kind) &&
    e.kind >= 0 &&
    Array.isArray(e.tags) &&
    typeof e.content === "string" &&
    typeof e.sig === "string" &&
    /^[0-9a-f]{128}$/.test(e.sig)
  );
}

/**
 * Verify a Nostr event's authenticity.
 *
 * @param event - Raw event object (parsed from JSON)
 * @param options.skipTimestamp - Skip timestamp validation (for historical events)
 * @param options.maxAge - Custom max age in seconds (default: 24h)
 * @returns VerificationResult with per-check breakdown
 */
export function verifyNostrEvent(
  event: unknown,
  options?: { skipTimestamp?: boolean; maxAge?: number }
): VerificationResult {
  const errors: string[] = [];
  const checks = {
    structure: false,
    id: false,
    signature: false,
    timestamp: false,
  };

  // 1. Structure check
  if (!validateStructure(event)) {
    errors.push("Invalid event structure — must conform to NIP-01");
    return { valid: false, checks, errors };
  }
  checks.structure = true;

  // 2. Event ID verification (sha256 of canonical serialization)
  try {
    const computedId = getEventHash(event);
    if (computedId === event.id) {
      checks.id = true;
    } else {
      errors.push(
        `Event ID mismatch: expected ${computedId}, got ${event.id}`
      );
    }
  } catch (err) {
    errors.push(
      `Failed to compute event hash: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  // 3. Schnorr signature verification
  try {
    if (verifyEvent(event)) {
      checks.signature = true;
    } else {
      errors.push("Schnorr signature verification failed");
    }
  } catch (err) {
    errors.push(
      `Signature verification error: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  // 4. Timestamp validation
  if (options?.skipTimestamp) {
    checks.timestamp = true;
  } else {
    const now = Math.floor(Date.now() / 1000);
    const maxAge = options?.maxAge ?? MAX_EVENT_AGE_SECONDS;
    const age = now - event.created_at;

    if (event.created_at > now + MAX_FUTURE_DRIFT_SECONDS) {
      errors.push(
        `Event is from the future: ${event.created_at} (now: ${now})`
      );
    } else if (age > maxAge) {
      errors.push(
        `Event too old: ${age}s (max: ${maxAge}s)`
      );
    } else {
      checks.timestamp = true;
    }
  }

  const valid =
    checks.structure && checks.id && checks.signature && checks.timestamp;

  return {
    valid,
    checks,
    errors,
    event: {
      id: event.id,
      kind: event.kind,
      pubkey: event.pubkey,
      created_at: event.created_at,
    },
  };
}

/**
 * Verify that an event is a valid bounty (kind:30402).
 * Checks structure, signature, AND bounty-specific tags.
 */
export function verifyBountyEvent(event: unknown): VerificationResult & {
  bounty?: {
    title: string;
    amount: string;
    currency: string;
    dTag: string;
  };
} {
  const result = verifyNostrEvent(event, { skipTimestamp: false });

  if (!result.valid || !validateStructure(event)) {
    return result;
  }

  // Bounty-specific: must be kind 30402 (replaceable parameterized)
  if (event.kind !== 30402) {
    result.errors.push(`Expected kind 30402 (bounty), got ${event.kind}`);
    result.valid = false;
    return result;
  }

  // Extract bounty tags
  const tags = event.tags as string[][];
  const getTag = (name: string) =>
    tags.find((t) => t[0] === name)?.[1] ?? "";

  const title = getTag("title") || getTag("subject");
  const amount = getTag("reward") || getTag("amount");
  const currency = getTag("currency") || "sats";
  const dTag = getTag("d");

  if (!title) {
    result.errors.push("Missing required tag: title or subject");
    result.valid = false;
  }

  if (!dTag) {
    result.errors.push("Missing required d-tag for replaceable event");
    result.valid = false;
  }

  return {
    ...result,
    bounty: { title, amount, currency, dTag },
  };
}
