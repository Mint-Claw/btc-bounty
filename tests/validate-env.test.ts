import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { validateEnv, validateEnvOrThrow } from "../src/lib/server/validate-env";

describe("validateEnv", () => {
  const origEnv = { ...process.env };

  beforeEach(() => {
    // Clear relevant env vars
    delete process.env.NEXT_PUBLIC_APP_URL;
    delete process.env.NEXT_PUBLIC_RELAYS;
    delete process.env.PLATFORM_NSEC;
    delete process.env.BTCPAY_URL;
    delete process.env.BTCPAY_API_KEY;
    delete process.env.BTCPAY_STORE_ID;
  });

  afterEach(() => {
    process.env = { ...origEnv };
  });

  it("reports missing required vars", () => {
    const result = validateEnv();
    expect(result.valid).toBe(false);
    expect(result.missing.length).toBeGreaterThan(0);
    expect(result.missing.some((m) => m.includes("NEXT_PUBLIC_APP_URL"))).toBe(true);
  });

  it("passes when required vars are set", () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://bounty.test";
    process.env.NEXT_PUBLIC_RELAYS = "wss://relay.test";
    const result = validateEnv();
    expect(result.valid).toBe(true);
    expect(result.missing).toHaveLength(0);
  });

  it("warns on optional missing vars", () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://bounty.test";
    process.env.NEXT_PUBLIC_RELAYS = "wss://relay.test";
    const result = validateEnv();
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it("warns on partial BTCPay config", () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://bounty.test";
    process.env.NEXT_PUBLIC_RELAYS = "wss://relay.test";
    process.env.BTCPAY_URL = "https://btcpay.test";
    // Missing API_KEY and STORE_ID
    const result = validateEnv();
    expect(result.warnings.some((w) => w.includes("BTCPay partially"))).toBe(true);
  });

  it("no BTCPay warning when fully configured", () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://bounty.test";
    process.env.NEXT_PUBLIC_RELAYS = "wss://relay.test";
    process.env.BTCPAY_URL = "https://btcpay.test";
    process.env.BTCPAY_API_KEY = "key123";
    process.env.BTCPAY_STORE_ID = "store456";
    const result = validateEnv();
    expect(result.warnings.some((w) => w.includes("BTCPay partially"))).toBe(false);
  });

  it("throws on missing required vars", () => {
    expect(() => validateEnvOrThrow()).toThrow("Missing required");
  });

  it("does not throw when valid", () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://bounty.test";
    process.env.NEXT_PUBLIC_RELAYS = "wss://relay.test";
    expect(() => validateEnvOrThrow()).not.toThrow();
  });

  it("tracks present vars", () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://bounty.test";
    process.env.NEXT_PUBLIC_RELAYS = "wss://relay.test";
    const result = validateEnv();
    expect(result.present).toContain("NEXT_PUBLIC_APP_URL");
    expect(result.present).toContain("NEXT_PUBLIC_RELAYS");
  });
});
