import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  resolveLightningAddress,
  buildZapRequestEvent,
  validateZapReceipt,
  type ZapRequest,
} from "../src/lib/nostr/zaps";

describe("NIP-57 Zaps", () => {
  describe("resolveLightningAddress", () => {
    beforeEach(() => {
      vi.restoreAllMocks();
    });

    it("should parse valid lightning address", async () => {
      const mockData = {
        callback: "https://getalby.com/lnurlp/forge/callback",
        minSendable: 1000,
        maxSendable: 500_000_000,
        allowsNostr: true,
        nostrPubkey: "abc123",
        metadata: '[[\"text/plain\",\"Pay forge\"]]',
      };

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockData),
      });

      const result = await resolveLightningAddress("forge@getalby.com");
      expect(result).toBeTruthy();
      expect(result!.callback).toBe(
        "https://getalby.com/lnurlp/forge/callback"
      );
      expect(result!.allowsNostr).toBe(true);
      expect(result!.nostrPubkey).toBe("abc123");

      expect(globalThis.fetch).toHaveBeenCalledWith(
        "https://getalby.com/.well-known/lnurlp/forge",
        expect.objectContaining({ headers: { Accept: "application/json" } })
      );
    });

    it("should return null for invalid address", async () => {
      const result = await resolveLightningAddress("not-an-address");
      expect(result).toBeNull();
    });

    it("should return null on fetch failure", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({ ok: false });
      const result = await resolveLightningAddress("test@example.com");
      expect(result).toBeNull();
    });

    it("should return null on network error", async () => {
      globalThis.fetch = vi.fn().mockRejectedValue(new Error("Network error"));
      const result = await resolveLightningAddress("test@example.com");
      expect(result).toBeNull();
    });

    it("should handle missing optional fields", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            callback: "https://example.com/cb",
          }),
      });

      const result = await resolveLightningAddress("test@example.com");
      expect(result).toBeTruthy();
      expect(result!.minSendable).toBe(1000);
      expect(result!.maxSendable).toBe(100_000_000_000);
      expect(result!.allowsNostr).toBe(false);
    });
  });

  describe("buildZapRequestEvent", () => {
    it("should build valid kind:9734 event", () => {
      const req: ZapRequest = {
        recipientPubkey: "abcdef1234567890",
        amountMsats: 21000,
        content: "Great bounty!",
        eventId: "event123",
        relays: ["wss://relay.damus.io", "wss://nos.lol"],
      };

      const event = buildZapRequestEvent(req);
      expect(event.kind).toBe(9734);
      expect(event.content).toBe("Great bounty!");

      // Check tags
      const pTag = event.tags.find((t) => t[0] === "p");
      expect(pTag).toEqual(["p", "abcdef1234567890"]);

      const amountTag = event.tags.find((t) => t[0] === "amount");
      expect(amountTag).toEqual(["amount", "21000"]);

      const eTag = event.tags.find((t) => t[0] === "e");
      expect(eTag).toEqual(["e", "event123"]);

      const relayTag = event.tags.find((t) => t[0] === "relays");
      expect(relayTag).toEqual([
        "relays",
        "wss://relay.damus.io",
        "wss://nos.lol",
      ]);
    });

    it("should omit event tag when no eventId", () => {
      const req: ZapRequest = {
        recipientPubkey: "abc123",
        amountMsats: 1000,
        relays: ["wss://relay.damus.io"],
      };

      const event = buildZapRequestEvent(req);
      const eTag = event.tags.find((t) => t[0] === "e");
      expect(eTag).toBeUndefined();
      expect(event.content).toBe("");
    });

    it("should set created_at to recent timestamp", () => {
      const req: ZapRequest = {
        recipientPubkey: "abc123",
        amountMsats: 1000,
        relays: ["wss://nos.lol"],
      };

      const event = buildZapRequestEvent(req);
      const now = Math.floor(Date.now() / 1000);
      expect(event.created_at).toBeGreaterThan(now - 5);
      expect(event.created_at).toBeLessThanOrEqual(now + 1);
    });
  });

  describe("validateZapReceipt", () => {
    it("should validate a proper zap receipt", () => {
      const zapRequest = {
        kind: 9734,
        pubkey: "sender123",
        tags: [
          ["p", "recipient456"],
          ["amount", "21000"],
        ],
        content: "Nice work!",
        created_at: 1700000000,
      };

      const receipt = {
        kind: 9735,
        pubkey: "lnurl-provider-pubkey",
        tags: [["description", JSON.stringify(zapRequest)]],
        content: "",
      };

      const result = validateZapReceipt(receipt);
      expect(result.valid).toBe(true);
      expect(result.amountMsats).toBe(21000);
      expect(result.senderPubkey).toBe("sender123");
    });

    it("should reject non-9735 events", () => {
      const result = validateZapReceipt({
        kind: 1,
        pubkey: "abc",
        tags: [],
        content: "",
      });
      expect(result.valid).toBe(false);
    });

    it("should reject missing description tag", () => {
      const result = validateZapReceipt({
        kind: 9735,
        pubkey: "abc",
        tags: [],
        content: "",
      });
      expect(result.valid).toBe(false);
    });

    it("should reject invalid JSON in description", () => {
      const result = validateZapReceipt({
        kind: 9735,
        pubkey: "abc",
        tags: [["description", "not-json"]],
        content: "",
      });
      expect(result.valid).toBe(false);
    });

    it("should reject wrong kind in zap request", () => {
      const result = validateZapReceipt({
        kind: 9735,
        pubkey: "abc",
        tags: [
          [
            "description",
            JSON.stringify({ kind: 1, pubkey: "x", tags: [] }),
          ],
        ],
        content: "",
      });
      expect(result.valid).toBe(false);
    });

    it("should handle missing amount gracefully", () => {
      const zapRequest = { kind: 9734, pubkey: "sender", tags: [] };
      const result = validateZapReceipt({
        kind: 9735,
        pubkey: "abc",
        tags: [["description", JSON.stringify(zapRequest)]],
        content: "",
      });
      expect(result.valid).toBe(true);
      expect(result.amountMsats).toBe(0);
    });
  });
});
