import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { setupTestDB, teardownTestDB } from "./helpers/test-db";
import {
  getDB,
  insertSubmission,
  getSubmission,
  getSubmissionsForBounty,
  updateSubmissionStatus,
} from "@/lib/server/db";

describe("submission persistence", () => {
  beforeEach(() => {
    setupTestDB();
    getDB().prepare("DELETE FROM bounty_submissions").run();
  });

  afterEach(() => teardownTestDB());

  it("stores and lists submissions by bounty", () => {
    insertSubmission({
      id: "sub-local-1",
      bountyDTag: "persist-bounty",
      bountyEventId: "event-persist",
      submitterPubkey: "worker-pubkey",
      proofUrl: "https://example.com/work",
      description: "Completed work proof",
      nostrEventId: "nostr-sub-1",
    });

    const row = getSubmission("sub-local-1");
    expect(row).toMatchObject({
      id: "sub-local-1",
      bounty_d_tag: "persist-bounty",
      bounty_event_id: "event-persist",
      submitter_pubkey: "worker-pubkey",
      proof_url: "https://example.com/work",
      description: "Completed work proof",
      nostr_event_id: "nostr-sub-1",
      status: "submitted",
    });

    const rows = getSubmissionsForBounty("persist-bounty");
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe("sub-local-1");
  });

  it("updates submission status for award review", () => {
    insertSubmission({
      id: "sub-local-2",
      bountyDTag: "review-bounty",
      submitterPubkey: "worker-pubkey",
      proofUrl: "https://example.com/work2",
      description: "Second completed proof",
    });

    expect(updateSubmissionStatus("sub-local-2", "accepted")).toBe(true);
    expect(getSubmission("sub-local-2")!.status).toBe("accepted");
  });
});
