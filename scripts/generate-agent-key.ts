#!/usr/bin/env -S npx tsx
/**
 * Generate an API key + NOSTR keypair for an agent.
 *
 * Usage:
 *   npx tsx scripts/generate-agent-key.ts
 *   npx tsx scripts/generate-agent-key.ts --name "my-agent"
 *
 * Output: the AGENT_API_KEYS entry to add to your .env file.
 */

import { generateSecretKey, getPublicKey } from "nostr-tools/pure";
import { bytesToHex } from "nostr-tools/utils";
import { randomBytes } from "crypto";

const name = process.argv.find((a) => a === "--name")
  ? process.argv[process.argv.indexOf("--name") + 1]
  : "agent-1";

// Generate NOSTR keypair
const sk = generateSecretKey();
const nsecHex = bytesToHex(sk);
const pubkey = getPublicKey(sk);

// Generate API key (32 random bytes, base64url)
const apiKey = randomBytes(32)
  .toString("base64url")
  .replace(/[^a-zA-Z0-9]/g, "")
  .slice(0, 32);

console.log(`\n🔑 Agent Key Generated: ${name}\n`);
console.log(`  API Key:     ${apiKey}`);
console.log(`  NOSTR Pubkey: ${pubkey}`);
console.log(`  NOSTR Nsec:   ${nsecHex}`);
console.log(`\n📋 Add to .env (append to existing AGENT_API_KEYS):\n`);
console.log(`  AGENT_API_KEYS="${apiKey}:${nsecHex}"`);
console.log(`\n  Or if you already have keys:\n`);
console.log(`  AGENT_API_KEYS="existing_key:existing_nsec,${apiKey}:${nsecHex}"`);
console.log(`\n🧪 Test with:\n`);
console.log(`  curl -H "X-API-Key: ${apiKey}" http://localhost:3000/api/bounties`);
console.log(`\n  curl -X POST -H "X-API-Key: ${apiKey}" \\`);
console.log(`    -H "Content-Type: application/json" \\`);
console.log(`    -d '{"title":"Test bounty","content":"Testing","rewardSats":1000,"category":"code"}' \\`);
console.log(`    http://localhost:3000/api/bounties`);
console.log();
