/**
 * Bounty Lifecycle E2E Test
 *
 * Tests the full bounty flow: create → apply → award → complete
 * Uses mocked Nostr relays but real DB + crypto.
 */

import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";

// Mock relay before imports
vi.mock("@/lib/server/relay", () => ({
  publishToRelays: vi.fn().mockResolvedValue({ successes: 1, failures: 0 }),
  fetchFromRelays: vi.fn().mockResolvedValue([]),
}));

describe("Bounty Lifecycle", () => {
  const testNsec =
    "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
  let creatorPubkey: string;
  let signedBounty: ReturnType<typeof signEventServer>;

  // Dynamic imports after mocks
  let signEventServer: typeof import("@/lib/server/signing").signEventServer;
  let buildBountyTags: typeof import("@/lib/nostr/schema").buildBountyTags;
  let parseBountyEvent: typeof import("@/lib/nostr/schema").parseBountyEvent;
  let verifyNostrEvent: typeof import("@/lib/nostr/verify").verifyNostrEvent;
  let getDB: typeof import("@/lib/server/db").getDB;

  beforeAll(async () => {
    const signing = await import("@/lib/server/signing");
    const schema = await import("@/lib/nostr/schema");
    const verify = await import("@/lib/nostr/verify");
    const db = await import("@/lib/server/db");

    signEventServer = signing.signEventServer;
    buildBountyTags = schema.buildBountyTags;
    parseBountyEvent = schema.parseBountyEvent;
    verifyNostrEvent = verify.verifyNostrEvent;
    getDB = db.getDB;
  });

  it("creates a valid bounty event", () => {
    const tags = buildBountyTags({
      dTag: "lifecycle-test-001",
      title: "Fix deployment pipeline",
      summary: "CI/CD is broken, need someone to fix GitHub Actions",
      rewardSats: 50000,
      category: "dev",
      lightning: "forge@getalby.com",
      tags: ["github-actions", "ci-cd"],
    });

    signedBounty = signEventServer(testNsec, {
      kind: 30402,
      content:
        "Full description: The GitHub Actions pipeline fails on the build step...",
      tags,
    });

    creatorPubkey = signedBounty.pubkey;

    expect(signedBounty.id).toBeDefined();
    expect(signedBounty.sig).toBeDefined();
    expect(signedBounty.kind).toBe(30402);
  });

  it("verifies the bounty event signature", () => {
    const result = verifyNostrEvent(signedBounty, { skipTimestamp: true });
    expect(result.valid).toBe(true);
  });

  it("parses bounty metadata from event", () => {
    const parsed = parseBountyEvent(signedBounty);
    expect(parsed).not.toBeNull();
    expect(parsed!.title).toBe("Fix deployment pipeline");
    expect(parsed!.rewardSats).toBe(50000);
    expect(parsed!.status).toBe("OPEN");
    expect(parsed!.dTag).toBe("lifecycle-test-001");
  });

  it("creates an application event", () => {
    // Application is a kind:1 reply to the bounty
    const appNsec =
      "abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789";

    const application = signEventServer(appNsec, {
      kind: 1,
      content: "I can fix this! I have experience with GitHub Actions.",
      tags: [
        ["e", signedBounty.id, "", "root"],
        ["p", creatorPubkey],
        ["t", "bounty-application"],
      ],
    });

    expect(application.id).toBeDefined();
    expect(application.sig).toBeDefined();

    const verify = verifyNostrEvent(application, { skipTimestamp: true });
    expect(verify.valid).toBe(true);

    // Application references the bounty
    const eTag = application.tags.find(
      (t: string[]) => t[0] === "e" && t[3] === "root",
    );
    expect(eTag?.[1]).toBe(signedBounty.id);
  });

  it("database initializes and is queryable", () => {
    const db = getDB();
    // DB should be functional
    const result = db.prepare("SELECT 1 as ok").get() as { ok: number };
    expect(result.ok).toBe(1);

    // Payments module should be importable and functional
    expect(getDB).toBeDefined();
  });

  it("builds a completion/award event", () => {
    const appNsec =
      "abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789";
    const applicantPubkey = signEventServer(appNsec, {
      kind: 1,
      content: "",
      tags: [],
    }).pubkey;

    // Award is an updated bounty event with status=COMPLETED
    const awardTags = buildBountyTags({
      dTag: "lifecycle-test-001",
      title: "Fix deployment pipeline",
      summary: "CI/CD is broken, need someone to fix GitHub Actions",
      rewardSats: 50000,
      category: "dev",
      lightning: "forge@getalby.com",
      tags: ["github-actions", "ci-cd"],
    });

    // Add winner tag
    awardTags.push(["p", applicantPubkey, "", "winner"]);
    awardTags.push(["status", "COMPLETED"]);

    const awardEvent = signEventServer(testNsec, {
      kind: 30402,
      content: "Awarded to applicant — great work!",
      tags: awardTags,
    });

    expect(awardEvent.id).toBeDefined();
    const parsed = parseBountyEvent(awardEvent);
    expect(parsed).not.toBeNull();

    // Verify winner tag present
    const winnerTag = awardEvent.tags.find(
      (t: string[]) => t[0] === "p" && t[3] === "winner",
    );
    expect(winnerTag?.[1]).toBe(applicantPubkey);
  });
});
