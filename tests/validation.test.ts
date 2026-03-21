import { describe, it, expect } from "vitest";
import {
  CreateBountySchema,
  UpdateBountyStatusSchema,
  SubmitWorkSchema,
  validateBody,
} from "@/lib/validation";

describe("CreateBountySchema", () => {
  const validBounty = {
    title: "Fix the login bug",
    content: "The login page crashes when...",
    rewardSats: 50000,
    lightning: "user@getalby.com",
  };

  it("accepts valid bounty", () => {
    const result = CreateBountySchema.safeParse(validBounty);
    expect(result.success).toBe(true);
  });

  it("accepts bounty with all optional fields", () => {
    const result = CreateBountySchema.safeParse({
      ...validBounty,
      summary: "Quick fix needed",
      category: "code",
      tags: ["bitcoin", "nostr"],
      image: "https://example.com/img.png",
      escrow: true,
    });
    expect(result.success).toBe(true);
  });

  it("rejects missing title", () => {
    const { title, ...rest } = validBounty;
    const result = CreateBountySchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it("rejects too-short title", () => {
    const result = CreateBountySchema.safeParse({ ...validBounty, title: "ab" });
    expect(result.success).toBe(false);
  });

  it("rejects reward below minimum (1000 sats)", () => {
    const result = CreateBountySchema.safeParse({ ...validBounty, rewardSats: 500 });
    expect(result.success).toBe(false);
  });

  it("rejects reward above maximum (1 BTC)", () => {
    const result = CreateBountySchema.safeParse({
      ...validBounty,
      rewardSats: 200_000_000,
    });
    expect(result.success).toBe(false);
  });

  it("rejects non-integer reward", () => {
    const result = CreateBountySchema.safeParse({ ...validBounty, rewardSats: 50.5 });
    expect(result.success).toBe(false);
  });

  it("rejects invalid lightning address", () => {
    const result = CreateBountySchema.safeParse({
      ...validBounty,
      lightning: "not-valid",
    });
    expect(result.success).toBe(false);
  });

  it("accepts LNURL lightning address", () => {
    const result = CreateBountySchema.safeParse({
      ...validBounty,
      lightning: "lnurl1dp68gurn8ghj7...",
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid category", () => {
    const result = CreateBountySchema.safeParse({
      ...validBounty,
      category: "invalid_category",
    });
    expect(result.success).toBe(false);
  });

  it("rejects too many tags", () => {
    const result = CreateBountySchema.safeParse({
      ...validBounty,
      tags: Array(11).fill("tag"),
    });
    expect(result.success).toBe(false);
  });

  it("defaults category to other", () => {
    const result = CreateBountySchema.safeParse(validBounty);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.category).toBe("other");
    }
  });
});

describe("UpdateBountyStatusSchema", () => {
  it("accepts valid status update", () => {
    const result = UpdateBountyStatusSchema.safeParse({ status: "COMPLETED" });
    expect(result.success).toBe(true);
  });

  it("rejects lowercase status", () => {
    const result = UpdateBountyStatusSchema.safeParse({ status: "completed" });
    expect(result.success).toBe(false);
  });

  it("accepts status with winner", () => {
    const result = UpdateBountyStatusSchema.safeParse({
      status: "COMPLETED",
      winner: "npub1abc123",
    });
    expect(result.success).toBe(true);
  });
});

describe("SubmitWorkSchema", () => {
  it("accepts valid submission", () => {
    const result = SubmitWorkSchema.safeParse({
      bountyDTag: "abc-123",
      content: "Here's my fix for the issue...",
    });
    expect(result.success).toBe(true);
  });

  it("rejects empty bountyDTag", () => {
    const result = SubmitWorkSchema.safeParse({
      bountyDTag: "",
      content: "Some work here...",
    });
    expect(result.success).toBe(false);
  });

  it("accepts submission with proof URL", () => {
    const result = SubmitWorkSchema.safeParse({
      bountyDTag: "abc-123",
      content: "Fixed the bug, see PR",
      proofUrl: "https://github.com/org/repo/pull/42",
    });
    expect(result.success).toBe(true);
  });
});

describe("validateBody", () => {
  it("returns data on valid input", () => {
    const result = validateBody(CreateBountySchema, {
      title: "Test bounty",
      content: "Need help with this task",
      rewardSats: 10000,
      lightning: "user@walletofsatoshi.com",
    });
    expect(result.error).toBeUndefined();
    expect(result.data).toBeDefined();
    expect(result.data?.title).toBe("Test bounty");
  });

  it("returns error on invalid input", () => {
    const result = validateBody(CreateBountySchema, {
      title: "ab",
      rewardSats: -1,
    });
    expect(result.error).toBeDefined();
    expect(result.details).toBeDefined();
    expect(result.details!.length).toBeGreaterThan(0);
  });
});
