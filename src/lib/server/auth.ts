/**
 * API key authentication for agent REST API.
 *
 * Supports two sources (checked in order):
 * 1. SQLite api_keys table (hashed keys, production-grade)
 * 2. AGENT_API_KEYS env var (legacy, for quick dev setup)
 *
 * API keys are SHA-256 hashed before storage/lookup. The raw key
 * is only held by the agent; we never store it in plaintext.
 */

import { createHash } from "crypto";
import { pubkeyFromNsec } from "./signing";
import { getApiKeyByHash, touchApiKeyUsage } from "./db";
import { decrypt, isEncrypted } from "./crypto";

export interface AgentIdentity {
  apiKey: string;
  nsecHex: string;
  pubkey: string;
}

// ─── SHA-256 hashing ─────────────────────────────────────────

export function hashApiKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

// ─── SQLite lookup ───────────────────────────────────────────

function lookupFromDB(apiKey: string): AgentIdentity | null {
  try {
    const hash = hashApiKey(apiKey);
    const row = getApiKeyByHash(hash);
    if (!row) return null;

    // Decrypt nsec (AES-256-GCM, or legacy plaintext hex)
    const stored = row.managed_nsec_encrypted;
    if (!stored) return null;

    let nsecHex: string;
    try {
      nsecHex = isEncrypted(stored) ? decrypt(stored) : stored;
    } catch (err) {
      console.error("[auth] Failed to decrypt managed nsec:", err);
      return null;
    }

    // Update last_used_at asynchronously
    try {
      touchApiKeyUsage(row.id);
    } catch {
      // Non-critical
    }

    return {
      apiKey,
      nsecHex,
      pubkey: row.agent_npub,
    };
  } catch {
    // DB not available (e.g. during testing without setup)
    return null;
  }
}

// ─── Env var lookup (legacy) ─────────────────────────────────

function loadAgentKeys(): Map<string, AgentIdentity> {
  const raw = process.env.AGENT_API_KEYS || "";
  const map = new Map<string, AgentIdentity>();

  if (!raw) return map;

  for (const entry of raw.split(",")) {
    const [key, nsecHex] = entry.trim().split(":");
    if (key && nsecHex && nsecHex.length === 64) {
      map.set(key, {
        apiKey: key,
        nsecHex,
        pubkey: pubkeyFromNsec(nsecHex),
      });
    }
  }

  return map;
}

let cachedKeys: Map<string, AgentIdentity> | null = null;

function getEnvKeys(): Map<string, AgentIdentity> {
  if (!cachedKeys) cachedKeys = loadAgentKeys();
  return cachedKeys;
}

// ─── Public API ──────────────────────────────────────────────

/**
 * Authenticate a request by X-API-Key header.
 * Checks SQLite first, then falls back to env vars.
 */
export function authenticateRequest(
  request: Request,
): AgentIdentity | null {
  const apiKey = request.headers.get("x-api-key");
  if (!apiKey) return null;

  // Try SQLite first
  const dbAgent = lookupFromDB(apiKey);
  if (dbAgent) return dbAgent;

  // Fall back to env var
  return getEnvKeys().get(apiKey) ?? null;
}

/**
 * Look up an agent identity by their NOSTR pubkey.
 */
export function getAgentByPubkey(pubkey: string): AgentIdentity | null {
  for (const agent of getEnvKeys().values()) {
    if (agent.pubkey === pubkey) return agent;
  }
  return null;
}

/**
 * Verify an API key string directly (without Request object).
 */
export function verifyApiKey(apiKey: string): AgentIdentity | null {
  if (!apiKey) return null;

  const dbAgent = lookupFromDB(apiKey);
  if (dbAgent) return dbAgent;

  return getEnvKeys().get(apiKey) ?? null;
}

/**
 * Reset cached keys (for testing).
 */
export function resetKeyCache(): void {
  cachedKeys = null;
}
