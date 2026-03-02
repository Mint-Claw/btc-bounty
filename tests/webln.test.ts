/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { hasWebLN, enableWebLN, copyLightningAddress } from "../src/lib/lightning/webln";

describe("WebLN adapter", () => {
  beforeEach(() => {
    // Reset window.webln
    (globalThis as any).window = { webln: undefined };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("hasWebLN returns false when not present", () => {
    expect(hasWebLN()).toBe(false);
  });

  it("hasWebLN returns true when present", () => {
    (globalThis as any).window.webln = {
      enable: vi.fn(),
      sendPayment: vi.fn(),
      keysend: vi.fn(),
    };
    expect(hasWebLN()).toBe(true);
  });

  it("enableWebLN returns false when no webln", async () => {
    expect(await enableWebLN()).toBe(false);
  });

  it("enableWebLN returns true on success", async () => {
    (globalThis as any).window.webln = {
      enable: vi.fn().mockResolvedValue(undefined),
    };
    expect(await enableWebLN()).toBe(true);
  });

  it("enableWebLN returns false on error", async () => {
    (globalThis as any).window.webln = {
      enable: vi.fn().mockRejectedValue(new Error("denied")),
    };
    expect(await enableWebLN()).toBe(false);
  });

  it("copyLightningAddress copies to clipboard", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    (globalThis as any).navigator = { clipboard: { writeText } };
    expect(await copyLightningAddress("satoshi@getalby.com")).toBe(true);
    expect(writeText).toHaveBeenCalledWith("satoshi@getalby.com");
  });

  it("copyLightningAddress returns false on failure", async () => {
    (globalThis as any).navigator = {
      clipboard: {
        writeText: vi.fn().mockRejectedValue(new Error("blocked")),
      },
    };
    expect(await copyLightningAddress("test@wallet.com")).toBe(false);
  });
});
