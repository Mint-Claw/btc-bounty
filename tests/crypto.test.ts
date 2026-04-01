/**
 * Tests for AES-256-GCM encryption module.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { encrypt, decrypt, isEncrypted, resetEncryptionKey } from "@/lib/server/crypto";

describe("AES-256-GCM Crypto", () => {
  beforeEach(() => {
    process.env.ENCRYPTION_SECRET = "test-secret-for-unit-tests-32ch";
    resetEncryptionKey();
  });

  afterEach(() => {
    delete process.env.ENCRYPTION_SECRET;
    resetEncryptionKey();
  });

  it("encrypts and decrypts a string", () => {
    const plaintext = "a".repeat(64); // nsec hex
    const encrypted = encrypt(plaintext);
    const decrypted = decrypt(encrypted);
    expect(decrypted).toBe(plaintext);
  });

  it("produces different ciphertext each time (random IV)", () => {
    const plaintext = "b".repeat(64);
    const a = encrypt(plaintext);
    const b = encrypt(plaintext);
    expect(a).not.toBe(b); // Random IVs
    expect(decrypt(a)).toBe(plaintext);
    expect(decrypt(b)).toBe(plaintext);
  });

  it("fails to decrypt with wrong key", () => {
    const plaintext = "c".repeat(64);
    const encrypted = encrypt(plaintext);

    // Change the key
    process.env.ENCRYPTION_SECRET = "different-secret-entirely-here!!";
    resetEncryptionKey();

    expect(() => decrypt(encrypted)).toThrow();
  });

  it("fails to decrypt tampered data", () => {
    const encrypted = encrypt("d".repeat(64));
    // Tamper with the ciphertext
    const buf = Buffer.from(encrypted, "base64");
    buf[buf.length - 1] ^= 0xff;
    const tampered = buf.toString("base64");

    expect(() => decrypt(tampered)).toThrow();
  });

  it("rejects too-short data", () => {
    expect(() => decrypt("AAAA")).toThrow("too short");
  });

  it("handles empty string encryption", () => {
    // Edge case: empty content
    const encrypted = encrypt("");
    expect(decrypt(encrypted)).toBe("");
  });

  it("handles long strings", () => {
    const long = "x".repeat(10000);
    const encrypted = encrypt(long);
    expect(decrypt(encrypted)).toBe(long);
  });
});

describe("isEncrypted", () => {
  it("detects plaintext hex nsec as NOT encrypted", () => {
    const nsecHex = "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2";
    expect(isEncrypted(nsecHex)).toBe(false);
  });

  it("detects encrypted base64 as encrypted", () => {
    process.env.ENCRYPTION_SECRET = "test-secret";
    resetEncryptionKey();
    const encrypted = encrypt("a".repeat(64));
    expect(isEncrypted(encrypted)).toBe(true);
  });

  it("detects short base64 as not encrypted", () => {
    expect(isEncrypted("AAAA")).toBe(false);
  });

  it("detects non-base64 as not encrypted", () => {
    expect(isEncrypted("not-base64-!!!")).toBe(false);
  });
});
