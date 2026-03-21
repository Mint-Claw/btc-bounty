import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  getLastSyncTimestamp,
} from "@/lib/server/bounty-sync";
import {
  cacheBountyEvent,
  getCachedBounty,
  listCachedBounties,
  getDB,
} from "@/lib/server/db";
import { parseBountyEvent, BOUNTY_KIND, buildBountyTags } from "@/lib/nostr/schema";

describe("Bounty Sync", () => {
  beforeEach(() => {
    const db = getDB();
    db.exec("DELETE FROM bounty_events");
  });

  describe("getLastSyncTimestamp", () => {
    it("returns 0 when no cached events", () => {
      expect(getLastSyncTimestamp()).toBe(0);
    });

    it("returns most recent created_at", () => {
      cacheBountyEvent({
        id: "old-event",
        dTag: "old",
        pubkey: "pub1",
        kind: BOUNTY_KIND,
        title: "Old Bounty",
        rewardSats: 1000,
        createdAt: 1700000000,
      });
      cacheBountyEvent({
        id: "new-event",
        dTag: "new",
        pubkey: "pub2",
        kind: BOUNTY_KIND,
        title: "New Bounty",
        rewardSats: 2000,
        createdAt: 1700001000,
      });
      // listCachedBounties orders by created_at DESC, limit 1 = newest
      expect(getLastSyncTimestamp()).toBe(1700001000);
    });
  });

  describe("parseBountyEvent → cacheBountyEvent round-trip", () => {
    it("parses a Nostr event and caches it", () => {
      const tags = buildBountyTags({
        dTag: "sync-test-bounty",
        title: "Sync Test",
        summary: "Test sync flow",
        rewardSats: 50000,
        category: "code",
        lightning: "lnbc50k...",
        tags: ["javascript", "nostr"],
      });

      const event = {
        id: "sync-event-id-123",
        pubkey: "sync-pubkey-hex",
        content: "Full description of the bounty",
        tags,
        created_at: 1700050000,
        kind: BOUNTY_KIND,
        sig: "fake-sig",
      };

      const bounty = parseBountyEvent(event);
      expect(bounty).not.toBeNull();

      cacheBountyEvent({
        id: bounty!.id,
        dTag: bounty!.dTag,
        pubkey: bounty!.pubkey,
        kind: BOUNTY_KIND,
        title: bounty!.title,
        summary: bounty!.summary,
        content: bounty!.content,
        rewardSats: bounty!.rewardSats,
        status: bounty!.status,
        category: bounty!.category,
        lightning: bounty!.lightning,
        tags: event.tags,
        createdAt: bounty!.createdAt,
      });

      const cached = getCachedBounty("sync-test-bounty");
      expect(cached).toBeDefined();
      expect(cached!.title).toBe("Sync Test");
      expect(cached!.reward_sats).toBe(50000);
      expect(cached!.status).toBe("OPEN");
      expect(cached!.category).toBe("code");
      expect(cached!.pubkey).toBe("sync-pubkey-hex");
    });

    it("handles events without optional fields", () => {
      const tags = buildBountyTags({
        dTag: "minimal-bounty",
        title: "Minimal",
        summary: "",
        rewardSats: 0,
        category: "other",
        lightning: "",
        tags: [],
      });

      const event = {
        id: "minimal-event-id",
        pubkey: "minimal-pubkey",
        content: "",
        tags,
        created_at: 1700060000,
        kind: BOUNTY_KIND,
        sig: "fake-sig",
      };

      const bounty = parseBountyEvent(event);
      expect(bounty).not.toBeNull();

      cacheBountyEvent({
        id: bounty!.id,
        dTag: bounty!.dTag,
        pubkey: bounty!.pubkey,
        kind: BOUNTY_KIND,
        title: bounty!.title,
        rewardSats: bounty!.rewardSats,
        createdAt: bounty!.createdAt,
      });

      const cached = getCachedBounty("minimal-bounty");
      expect(cached!.title).toBe("Minimal");
      expect(cached!.reward_sats).toBe(0);
      expect(cached!.status).toBe("OPEN");
    });
  });

  describe("cache query integration", () => {
    it("filters synced bounties by status", () => {
      // Simulate syncing multiple bounties
      for (const [i, status] of ["OPEN", "OPEN", "COMPLETED", "IN_PROGRESS"].entries()) {
        cacheBountyEvent({
          id: `filter-${i}`,
          dTag: `filter-${i}`,
          pubkey: "pub",
          kind: BOUNTY_KIND,
          title: `Bounty ${i}`,
          status,
          rewardSats: 1000 * (i + 1),
          createdAt: 1700000000 + i,
        });
      }

      const open = listCachedBounties({ status: "OPEN" });
      expect(open.length).toBe(2);

      const completed = listCachedBounties({ status: "COMPLETED" });
      expect(completed.length).toBe(1);
    });

    it("paginates synced results", () => {
      for (let i = 0; i < 10; i++) {
        cacheBountyEvent({
          id: `page-${i}`,
          dTag: `page-${i}`,
          pubkey: "pub",
          kind: BOUNTY_KIND,
          title: `Page ${i}`,
          rewardSats: 100,
          createdAt: 1700000000 + i,
        });
      }

      const page1 = listCachedBounties({ limit: 3, offset: 0 });
      const page2 = listCachedBounties({ limit: 3, offset: 3 });
      expect(page1.length).toBe(3);
      expect(page2.length).toBe(3);
      // Ordered by created_at DESC
      expect(page1[0].created_at).toBeGreaterThan(page2[0].created_at);
    });
  });
});
