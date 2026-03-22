import { describe, it, expect, beforeEach } from "vitest";
import {
  cacheBountyEvent,
  getCachedBounty,
  updateBountyStatus,
  getBountyStats,
  getDB,
} from "@/lib/server/db";

describe("Bounty Workflow (OPEN → IN_PROGRESS → COMPLETED)", () => {
  beforeEach(() => {
    const db = getDB();
    db.exec("DELETE FROM bounty_events");
  });

  const bounty = {
    id: "wf-test-1",
    dTag: "workflow-bounty",
    pubkey: "owner_pubkey_hex",
    kind: 30402,
    title: "Build REST API",
    summary: "Need a REST API for the app",
    rewardSats: 50000,
    status: "OPEN",
    category: "code",
    createdAt: 1700000000,
  };

  it("creates bounty in OPEN state", () => {
    cacheBountyEvent(bounty);
    const b = getCachedBounty("workflow-bounty");
    expect(b!.status).toBe("OPEN");
    expect(b!.winner_pubkey).toBeNull();
  });

  it("transitions OPEN → IN_PROGRESS on apply", () => {
    cacheBountyEvent(bounty);
    const updated = updateBountyStatus(
      "workflow-bounty",
      "IN_PROGRESS",
      "worker_pubkey_hex",
    );
    expect(updated).toBe(true);
    const b = getCachedBounty("workflow-bounty");
    expect(b!.status).toBe("IN_PROGRESS");
    expect(b!.winner_pubkey).toBe("worker_pubkey_hex");
  });

  it("transitions IN_PROGRESS → COMPLETED", () => {
    cacheBountyEvent(bounty);
    updateBountyStatus("workflow-bounty", "IN_PROGRESS", "worker_pubkey_hex");
    const updated = updateBountyStatus("workflow-bounty", "COMPLETED", "worker_pubkey_hex");
    expect(updated).toBe(true);
    const b = getCachedBounty("workflow-bounty");
    expect(b!.status).toBe("COMPLETED");
    expect(b!.winner_pubkey).toBe("worker_pubkey_hex");
  });

  it("transitions OPEN → CANCELLED", () => {
    cacheBountyEvent(bounty);
    const updated = updateBountyStatus("workflow-bounty", "CANCELLED");
    expect(updated).toBe(true);
    const b = getCachedBounty("workflow-bounty");
    expect(b!.status).toBe("CANCELLED");
  });

  it("preserves winner_pubkey across status changes", () => {
    cacheBountyEvent(bounty);
    updateBountyStatus("workflow-bounty", "IN_PROGRESS", "worker1");
    // Change worker
    updateBountyStatus("workflow-bounty", "IN_PROGRESS", "worker2");
    const b = getCachedBounty("workflow-bounty");
    expect(b!.winner_pubkey).toBe("worker2");
  });

  it("full lifecycle: create → apply → complete", () => {
    cacheBountyEvent(bounty);

    // Step 1: OPEN
    let b = getCachedBounty("workflow-bounty")!;
    expect(b.status).toBe("OPEN");

    // Step 2: Apply
    updateBountyStatus("workflow-bounty", "IN_PROGRESS", "dev_pubkey");
    b = getCachedBounty("workflow-bounty")!;
    expect(b.status).toBe("IN_PROGRESS");
    expect(b.winner_pubkey).toBe("dev_pubkey");

    // Step 3: Complete
    updateBountyStatus("workflow-bounty", "COMPLETED", "dev_pubkey");
    b = getCachedBounty("workflow-bounty")!;
    expect(b.status).toBe("COMPLETED");
    expect(b.winner_pubkey).toBe("dev_pubkey");
    expect(b.reward_sats).toBe(50000);
  });

  it("stats reflect workflow transitions", () => {
    cacheBountyEvent(bounty);
    cacheBountyEvent({
      ...bounty,
      id: "wf-test-2",
      dTag: "second-bounty",
      rewardSats: 25000,
    });

    // Complete one
    updateBountyStatus("workflow-bounty", "COMPLETED", "winner");

    const stats = getBountyStats();
    expect(stats.total).toBe(2);
    expect(stats.open).toBe(1);
    expect(stats.completed).toBe(1);
    expect(stats.total_sats).toBe(75000);
  });
});
