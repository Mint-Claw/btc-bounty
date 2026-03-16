/**
 * API key authentication middleware for agent REST API.
 * 
 * In Phase 2, API keys are stored in env vars for simplicity.
 * Format: AGENT_API_KEYS="key1:nsec1hex,key2:nsec2hex"
 * 
 * Each key maps to a managed NOSTR secret key for server-side signing.
 */

import { pubkeyFromNsec } from "./signing";

export interface AgentIdentity {
  apiKey: string;
  nsecHex: string;
  pubkey: string;
}

/**
 * Parse AGENT_API_KEYS env var into agent identities.
 */
function loadAgentKeys(): Map<string, AgentIdentity> {
  const raw = process.env.AGENT_API_KEYS || "";
  const map = new Map<string, AgentIdentity>();

  if (!raw) return map;

  for (const entry of raw.split(",")) {
    const [apiKey, nsecHex] = entry.trim().split(":");
    if (apiKey && nsecHex && nsecHex.length === 64) {
      map.set(apiKey, {
        apiKey,
        nsecHex,
        pubkey: pubkeyFromNsec(nsecHex),
      });
    }
  }

  return map;
}

let cachedKeys: Map<string, AgentIdentity> | null = null;

function getKeys(): Map<string, AgentIdentity> {
  if (!cachedKeys) cachedKeys = loadAgentKeys();
  return cachedKeys;
}

/**
 * Authenticate a request by X-API-Key header.
 * Returns the agent identity or null if unauthorized.
 */
export function authenticateRequest(
  request: Request,
): AgentIdentity | null {
  const apiKey = request.headers.get("x-api-key");
  if (!apiKey) return null;
  return getKeys().get(apiKey) ?? null;
}

/**
 * Look up an agent identity by their NOSTR pubkey.
 * Returns the agent or null if no managed key exists for this pubkey.
 */
export function getAgentByPubkey(pubkey: string): AgentIdentity | null {
  for (const agent of getKeys().values()) {
    if (agent.pubkey === pubkey) return agent;
  }
  return null;
}

/**
 * Reset cached keys (for testing).
 */
export function resetKeyCache(): void {
  cachedKeys = null;
}
