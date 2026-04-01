#!/usr/bin/env -S npx tsx
/**
 * Generate an API key + NOSTR keypair for an agent.
 *
 * Usage:
 *   npx tsx scripts/generate-agent-key.ts
 *   npx tsx scripts/generate-agent-key.ts --name my-agent
 *   npx tsx scripts/generate-agent-key.ts --name my-agent --db   # also writes to SQLite
 *
 * Output: the API key and NOSTR pubkey for the agent.
 */

import { generateSecretKey, getPublicKey } from "nostr-tools/pure";
import { bytesToHex } from "nostr-tools/utils";
import { randomBytes, createHash } from "crypto";

const args = process.argv.slice(2);
const nameIdx = args.indexOf("--name");
const name = nameIdx >= 0 && args[nameIdx + 1] ? args[nameIdx + 1] : "agent-1";
const writeDB = args.includes("--db");

// Generate NOSTR keypair
const sk = generateSecretKey();
const nsecHex = bytesToHex(sk);
const pubkey = getPublicKey(sk);

// Generate API key (32 random bytes, base64url, 40 chars)
const apiKey = randomBytes(32)
  .toString("base64url")
  .replace(/[^a-zA-Z0-9]/g, "")
  .slice(0, 40);

const apiKeyHash = createHash("sha256").update(apiKey).digest("hex");

console.log(`\n🔑 Agent Key Generated: ${name}\n`);
console.log(`  API Key:      ${apiKey}`);
console.log(`  Key Hash:     ${apiKeyHash.slice(0, 16)}...`);
console.log(`  NOSTR Pubkey: ${pubkey}`);
console.log(`  NOSTR Nsec:   ${nsecHex}`);

if (writeDB) {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { insertApiKey } = require("../src/lib/server/db");
    const id = crypto.randomUUID();
    insertApiKey({
      id,
      agentNpub: pubkey,
      apiKeyHash,
      managedNsecEncrypted: nsecHex,
    });
    console.log(`\n  ✅ Written to SQLite (id: ${id})`);
  } catch (e) {
    console.error(`\n  ❌ DB write failed: ${e}`);
    console.log(`\n  Falling back to env var method below.`);
  }
}

console.log(`\n📋 Env var method (add to .env):\n`);
console.log(`  AGENT_API_KEYS="${apiKey}:${nsecHex}"`);
console.log(`\n  Or append to existing:\n`);
console.log(`  AGENT_API_KEYS="existing_key:existing_nsec,${apiKey}:${nsecHex}"`);
console.log(`\n🧪 Test with:\n`);
console.log(`  curl -H "X-API-Key: ${apiKey}" http://localhost:3000/api/bounties`);
console.log(`\n  curl -X POST -H "X-API-Key: ${apiKey}" \\`);
console.log(`    -H "Content-Type: application/json" \\`);
console.log(`    -d '{"title":"Test bounty","content":"Testing","rewardSats":1000,"category":"code"}' \\`);
console.log(`    http://localhost:3000/api/bounties`);
console.log();
