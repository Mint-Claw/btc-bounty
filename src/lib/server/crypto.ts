/**
 * AES-256-GCM encryption for sensitive data at rest.
 *
 * Used to encrypt managed NOSTR secret keys (nsec) before storing in SQLite.
 * The encryption key is derived from ENCRYPTION_SECRET env var using PBKDF2.
 * If no secret is set, falls back to a deterministic machine key (less secure
 * but prevents plaintext storage).
 *
 * Format: base64(iv:authTag:ciphertext)
 *   - iv: 12 bytes (96-bit, GCM standard)
 *   - authTag: 16 bytes (128-bit)
 *   - ciphertext: variable length
 */

import { createCipheriv, createDecipheriv, randomBytes, pbkdf2Sync } from "crypto";
import { createHash } from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;
const SALT = "btc-bounty-nsec-v1"; // Static salt (key uniqueness comes from the secret)

/**
 * Derive a 256-bit encryption key from the configured secret.
 *
 * Uses PBKDF2 with SHA-512 and 100k iterations.
 * Caches the derived key for the process lifetime.
 */
let _derivedKey: Buffer | null = null;

function getEncryptionKey(): Buffer {
  if (_derivedKey) return _derivedKey;

  let secret = process.env.ENCRYPTION_SECRET;

  if (!secret) {
    // Fallback: derive from hostname + pid as a weak machine-bound key.
    // This is NOT secure against a determined attacker with DB access,
    // but it's better than plaintext and works without configuration.
    const os = require("os");
    secret = `btc-bounty-fallback:${os.hostname()}:${os.userInfo().username}`;
    console.warn(
      "[crypto] ENCRYPTION_SECRET not set — using machine-derived key. " +
        "Set ENCRYPTION_SECRET for production security."
    );
  }

  _derivedKey = pbkdf2Sync(secret, SALT, 100_000, 32, "sha512");
  return _derivedKey;
}

/**
 * Encrypt a plaintext string with AES-256-GCM.
 *
 * @returns Base64-encoded string containing iv + authTag + ciphertext
 */
export function encrypt(plaintext: string): string {
  const key = getEncryptionKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);

  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);

  const authTag = cipher.getAuthTag();

  // Pack: iv (12) + authTag (16) + ciphertext (N)
  const packed = Buffer.concat([iv, authTag, encrypted]);
  return packed.toString("base64");
}

/**
 * Decrypt a base64-encoded AES-256-GCM ciphertext.
 *
 * @returns Decrypted plaintext string
 * @throws If decryption fails (wrong key, tampered data, etc.)
 */
export function decrypt(encoded: string): string {
  const key = getEncryptionKey();
  const packed = Buffer.from(encoded, "base64");

  if (packed.length < IV_LENGTH + AUTH_TAG_LENGTH) {
    throw new Error("Invalid encrypted data: too short");
  }

  const iv = packed.subarray(0, IV_LENGTH);
  const authTag = packed.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const ciphertext = packed.subarray(IV_LENGTH + AUTH_TAG_LENGTH);

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]);

  return decrypted.toString("utf8");
}

/**
 * Check if a string looks like it's already encrypted (base64 with correct prefix length).
 * Used to handle migration from plaintext to encrypted storage.
 */
export function isEncrypted(value: string): boolean {
  // Plaintext nsec hex is exactly 64 hex chars
  if (/^[0-9a-f]{64}$/.test(value)) return false;
  // Encrypted values are base64 and longer
  try {
    const buf = Buffer.from(value, "base64");
    return buf.length >= IV_LENGTH + AUTH_TAG_LENGTH;
  } catch {
    return false;
  }
}

/**
 * Reset the derived key cache (for testing with different secrets).
 */
export function resetEncryptionKey(): void {
  _derivedKey = null;
}
