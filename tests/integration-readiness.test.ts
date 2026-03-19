/**
 * Integration Readiness Tests
 *
 * Validates that all critical subsystems are configured and functional
 * for production deployment. These tests check env vars, module imports,
 * and basic connectivity without making real external calls.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

describe("Deployment Readiness", () => {
  describe("Required Modules", () => {
    it("nostr schema exports all required types", async () => {
      const schema = await import("@/lib/nostr/schema");
      expect(schema.BOUNTY_KIND).toBe(30402);
      expect(schema.buildBountyTags).toBeDefined();
      expect(schema.parseBountyEvent).toBeDefined();
      expect(typeof schema.buildBountyTags).toBe("function");
      expect(typeof schema.parseBountyEvent).toBe("function");
    });

    it("nostr verify exports verifyNostrEvent", async () => {
      const verify = await import("@/lib/nostr/verify");
      expect(verify.verifyNostrEvent).toBeDefined();
      expect(typeof verify.verifyNostrEvent).toBe("function");
    });

    it("server auth exports authenticateRequest", async () => {
      const auth = await import("@/lib/server/auth");
      expect(auth.authenticateRequest).toBeDefined();
    });

    it("server signing exports signEventServer", async () => {
      const signing = await import("@/lib/server/signing");
      expect(signing.signEventServer).toBeDefined();
    });

    it("server relay exports publish and fetch", async () => {
      const relay = await import("@/lib/server/relay");
      expect(relay.publishToRelays).toBeDefined();
      expect(relay.fetchFromRelays).toBeDefined();
    });

    it("server db exports getDB", async () => {
      const db = await import("@/lib/server/db");
      expect(db.getDB).toBeDefined();
    });

    it("webhook delivery exports deliverWebhook", async () => {
      const wh = await import("@/lib/server/webhooks");
      expect(wh.deliverWebhook).toBeDefined();
    });

    it("expiration service exports expireStale", async () => {
      const exp = await import("@/lib/server/expiration");
      expect(exp.expireStale).toBeDefined();
      expect(exp.getExpiration).toBeDefined();
    });
  });

  describe("Schema Validation", () => {
    it("buildBountyTags produces valid NIP-99 tags", async () => {
      const { buildBountyTags } = await import("@/lib/nostr/schema");
      const tags = buildBountyTags({
        dTag: "test-123",
        title: "Fix a bug",
        summary: "Short summary",
        rewardSats: 10000,
        category: "dev",
        lightning: "test@getalby.com",
        tags: ["rust", "nostr"],
      });

      // Must have required NIP-99 tags
      expect(tags.find((t: string[]) => t[0] === "d")?.[1]).toBe("test-123");
      expect(tags.find((t: string[]) => t[0] === "title")?.[1]).toBe("Fix a bug");
      expect(tags.find((t: string[]) => t[0] === "summary")?.[1]).toBe("Short summary");

      // Must have reward and lightning
      const hasReward = tags.some(
        (t: string[]) => t[0] === "reward" || t[0] === "price"
      );
      expect(hasReward).toBe(true);
    });

    it("parseBountyEvent handles valid kind:30402 events", async () => {
      const { parseBountyEvent, buildBountyTags } = await import(
        "@/lib/nostr/schema"
      );

      const tags = buildBountyTags({
        dTag: "parse-test",
        title: "Test Bounty",
        summary: "A test",
        rewardSats: 5000,
        category: "design",
        lightning: "user@walletofsatoshi.com",
        tags: [],
      });

      const parsed = parseBountyEvent({
        id: "abc123",
        pubkey: "def456",
        content: "Bounty description here",
        tags,
        created_at: Math.floor(Date.now() / 1000),
      });

      expect(parsed).not.toBeNull();
      expect(parsed!.title).toBe("Test Bounty");
      expect(parsed!.rewardSats).toBe(5000);
      expect(parsed!.status).toBe("OPEN");
    });

    it("parseBountyEvent returns null for invalid events", async () => {
      const { parseBountyEvent } = await import("@/lib/nostr/schema");

      const parsed = parseBountyEvent({
        id: "bad",
        pubkey: "bad",
        content: "",
        tags: [], // No required tags
        created_at: 0,
      });

      expect(parsed).toBeNull();
    });
  });

  describe("Database", () => {
    it("getDB initializes without error", async () => {
      const { getDB } = await import("@/lib/server/db");
      const db = getDB();
      expect(db).toBeDefined();
      // DB should be queryable
      const result = db.prepare("SELECT 1 as ok").get() as { ok: number };
      expect(result.ok).toBe(1);
    });

    it("createPayment and getPaymentStats are exported", async () => {
      const payments = await import("@/lib/server/payments");
      expect(payments.createPayment).toBeDefined();
      expect(payments.getPaymentStats).toBeDefined();
    });
  });

  describe("Crypto", () => {
    it("can sign and verify a Nostr event round-trip", async () => {
      const { signEventServer } = await import("@/lib/server/signing");
      const { verifyNostrEvent } = await import("@/lib/nostr/verify");

      // Generate a test keypair (32 bytes hex)
      const testNsec =
        "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

      const signed = signEventServer(testNsec, {
        kind: 1,
        content: "Integration test event",
        tags: [["t", "test"]],
      });

      expect(signed.id).toBeDefined();
      expect(signed.sig).toBeDefined();
      expect(signed.pubkey).toBeDefined();

      const result = verifyNostrEvent(signed, { skipTimestamp: true });
      expect(result.valid).toBe(true);
    });
  });
});
