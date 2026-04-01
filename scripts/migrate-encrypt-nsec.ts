#!/usr/bin/env npx tsx
/**
 * Migrate plaintext nsec values to AES-256-GCM encrypted.
 *
 * Run once after deploying the encryption update.
 * Idempotent: skips already-encrypted values.
 *
 * Usage:
 *   ENCRYPTION_SECRET=your-secret npx tsx scripts/migrate-encrypt-nsec.ts
 *   ENCRYPTION_SECRET=your-secret npx tsx scripts/migrate-encrypt-nsec.ts --dry-run
 */

import { getDB, closeDB } from "../src/lib/server/db";
import { encrypt, isEncrypted, decrypt, resetEncryptionKey } from "../src/lib/server/crypto";

const dryRun = process.argv.includes("--dry-run");

async function main() {
  if (!process.env.ENCRYPTION_SECRET) {
    console.error("❌ ENCRYPTION_SECRET env var required");
    console.error("   Set it to the same value you'll use in production.");
    process.exit(1);
  }

  resetEncryptionKey();

  const db = getDB();
  const rows = db
    .prepare("SELECT id, agent_npub, managed_nsec_encrypted FROM api_keys")
    .all() as { id: string; agent_npub: string; managed_nsec_encrypted: string | null }[];

  console.log(`Found ${rows.length} API key(s) in database\n`);

  let encrypted = 0;
  let skipped = 0;
  let failed = 0;

  for (const row of rows) {
    const nsec = row.managed_nsec_encrypted;
    if (!nsec) {
      console.log(`  ⏭  ${row.id.slice(0, 8)}... — no nsec stored`);
      skipped++;
      continue;
    }

    if (isEncrypted(nsec)) {
      // Verify it decrypts correctly
      try {
        const decrypted = decrypt(nsec);
        if (/^[0-9a-f]{64}$/.test(decrypted)) {
          console.log(`  ✅ ${row.id.slice(0, 8)}... — already encrypted (verified)`);
        } else {
          console.log(`  ⚠️  ${row.id.slice(0, 8)}... — encrypted but decrypted to unexpected format`);
        }
      } catch {
        console.log(`  ❌ ${row.id.slice(0, 8)}... — encrypted but can't decrypt (wrong key?)`);
        failed++;
      }
      skipped++;
      continue;
    }

    // Plaintext hex — needs encryption
    if (!/^[0-9a-f]{64}$/.test(nsec)) {
      console.log(`  ⚠️  ${row.id.slice(0, 8)}... — unexpected format: ${nsec.slice(0, 20)}...`);
      skipped++;
      continue;
    }

    if (dryRun) {
      console.log(`  🔒 ${row.id.slice(0, 8)}... — would encrypt (dry run)`);
      encrypted++;
      continue;
    }

    try {
      const encryptedValue = encrypt(nsec);

      // Verify round-trip before writing
      const verified = decrypt(encryptedValue);
      if (verified !== nsec) {
        throw new Error("Round-trip verification failed");
      }

      db.prepare("UPDATE api_keys SET managed_nsec_encrypted = ? WHERE id = ?")
        .run(encryptedValue, row.id);

      console.log(`  🔒 ${row.id.slice(0, 8)}... — encrypted successfully`);
      encrypted++;
    } catch (err) {
      console.error(`  ❌ ${row.id.slice(0, 8)}... — encryption failed:`, err);
      failed++;
    }
  }

  console.log(`\n${"─".repeat(50)}`);
  console.log(`Encrypted: ${encrypted}  Skipped: ${skipped}  Failed: ${failed}`);
  if (dryRun) console.log("(Dry run — no changes written)");

  closeDB();
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
