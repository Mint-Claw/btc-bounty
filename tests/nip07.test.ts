/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { hasNIP07, getPublicKey, signEvent, NIP07Error } from "../src/lib/nostr/nip07";

describe("NIP-07 adapter", () => {
  beforeEach(() => {
    (globalThis as any).window = {};
  });

  it("hasNIP07 returns false when no extension", () => {
    expect(hasNIP07()).toBe(false);
  });

  it("hasNIP07 returns true when extension present", () => {
    (globalThis as any).window.nostr = { getPublicKey: vi.fn() };
    expect(hasNIP07()).toBe(true);
  });

  it("getPublicKey throws NO_EXTENSION when missing", async () => {
    await expect(getPublicKey()).rejects.toThrow(NIP07Error);
    try {
      await getPublicKey();
    } catch (e) {
      expect((e as NIP07Error).code).toBe("NO_EXTENSION");
    }
  });

  it("getPublicKey returns pubkey on success", async () => {
    (globalThis as any).window.nostr = {
      getPublicKey: vi.fn().mockResolvedValue("deadbeef01234567"),
    };
    const pk = await getPublicKey();
    expect(pk).toBe("deadbeef01234567");
  });

  it("getPublicKey throws USER_REJECTED on rejection", async () => {
    (globalThis as any).window.nostr = {
      getPublicKey: vi.fn().mockRejectedValue(new Error("User rejected")),
    };
    try {
      await getPublicKey();
      expect.unreachable("should throw");
    } catch (e) {
      expect(e).toBeInstanceOf(NIP07Error);
      expect((e as NIP07Error).code).toBe("USER_REJECTED");
    }
  });

  it("signEvent throws NO_EXTENSION when missing", async () => {
    const event = { kind: 1, content: "test", tags: [], created_at: 0 };
    await expect(signEvent(event)).rejects.toThrow(NIP07Error);
  });

  it("signEvent returns signed event on success", async () => {
    const signed = {
      id: "abc",
      pubkey: "pk1",
      created_at: 1700000000,
      kind: 30402,
      tags: [["d", "test"]],
      content: "bounty",
      sig: "sig123",
    };
    (globalThis as any).window.nostr = {
      signEvent: vi.fn().mockResolvedValue(signed),
    };
    const result = await signEvent({
      kind: 30402,
      content: "bounty",
      tags: [["d", "test"]],
      created_at: 1700000000,
    });
    expect(result.id).toBe("abc");
    expect(result.sig).toBe("sig123");
  });

  it("signEvent throws USER_REJECTED on rejection", async () => {
    (globalThis as any).window.nostr = {
      signEvent: vi.fn().mockRejectedValue(new Error("User rejected signing")),
    };
    try {
      await signEvent({ kind: 1, content: "", tags: [], created_at: 0 });
      expect.unreachable("should throw");
    } catch (e) {
      expect((e as NIP07Error).code).toBe("USER_REJECTED");
    }
  });
});
