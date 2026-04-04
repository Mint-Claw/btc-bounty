/**
 * Nostr schema tests — NIP-99 bounty event compliance.
 *
 * Tests parseBountyEvent and buildBountyTags for:
 * - Required tags (d, title)
 * - Optional tags (summary, reward, category, lightning, expiry, image)
 * - Malformed event handling
 * - Round-trip: build → parse
 */
import { describe, it, expect } from "vitest";
import {
	BOUNTY_KIND,
	parseBountyEvent,
	buildBountyTags,
	type BountyCategory,
} from "@/lib/nostr/schema";

// ─── Helpers ─────────────────────────────────────────────────

function makeEvent(
	tags: string[][],
	overrides: Partial<{
		id: string;
		pubkey: string;
		content: string;
		created_at: number;
	}> = {},
) {
	return {
		id: overrides.id ?? "event-abc123",
		pubkey: overrides.pubkey ?? "pubkey-hex-0000",
		content: overrides.content ?? "Fix the relay under load.",
		tags,
		created_at: overrides.created_at ?? 1700000000,
	};
}

function fullTags(overrides: Record<string, string> = {}): string[][] {
	const defaults: Record<string, string> = {
		d: "bounty-slug-001",
		title: "Fix Nostr relay",
		summary: "The relay drops events under load.",
		reward: "50000",
		status: "OPEN",
		category: "code",
		lightning: "poster@getalby.com",
	};
	const merged = { ...defaults, ...overrides };
	return Object.entries(merged).map(([k, v]) => [k, v]);
}

// ─── parseBountyEvent ────────────────────────────────────────

describe("parseBountyEvent", () => {
	it("parses a well-formed bounty event", () => {
		const ev = makeEvent(fullTags());
		const b = parseBountyEvent(ev);
		expect(b).not.toBeNull();
		expect(b!.dTag).toBe("bounty-slug-001");
		expect(b!.title).toBe("Fix Nostr relay");
		expect(b!.rewardSats).toBe(50000);
		expect(b!.status).toBe("OPEN");
		expect(b!.category).toBe("code");
		expect(b!.lightning).toBe("poster@getalby.com");
		expect(b!.pubkey).toBe("pubkey-hex-0000");
		expect(b!.content).toBe("Fix the relay under load.");
		expect(b!.createdAt).toBe(1700000000);
	});

	it("returns null when d-tag is missing", () => {
		const tags = fullTags();
		const filtered = tags.filter((t) => t[0] !== "d");
		const ev = makeEvent(filtered);
		expect(parseBountyEvent(ev)).toBeNull();
	});

	it("returns null when title is missing", () => {
		const tags = fullTags();
		const filtered = tags.filter((t) => t[0] !== "title");
		const ev = makeEvent(filtered);
		expect(parseBountyEvent(ev)).toBeNull();
	});

	it("handles missing optional fields gracefully", () => {
		const ev = makeEvent([
			["d", "minimal-bounty"],
			["title", "Minimal Bounty"],
			["reward", "0", "sats"],
		]);
		const b = parseBountyEvent(ev);
		expect(b).not.toBeNull();
		expect(b!.summary).toBe("");
		expect(b!.rewardSats).toBe(0);
		expect(b!.status).toBe("OPEN");
		expect(b!.category).toBe("other");
		expect(b!.lightning).toBe("");
		expect(b!.expiry).toBeUndefined();
		expect(b!.winner).toBeUndefined();
		expect(b!.image).toBeUndefined();
	});

	it("parses topic tags", () => {
		const tags = [
			...fullTags(),
			["t", "rust"],
			["t", "nostr"],
			["t", "relay"],
		];
		const b = parseBountyEvent(makeEvent(tags));
		expect(b!.tags).toEqual(["rust", "nostr", "relay"]);
	});

	it("parses expiry timestamp", () => {
		const tags = [...fullTags(), ["expiry", "1700100000"]];
		const b = parseBountyEvent(makeEvent(tags));
		expect(b!.expiry).toBe(1700100000);
	});

	it("parses winner tag", () => {
		const tags = fullTags({ winner: "winner-pubkey-hex", status: "COMPLETED" });
		const b = parseBountyEvent(makeEvent(tags));
		expect(b!.winner).toBe("winner-pubkey-hex");
		expect(b!.status).toBe("COMPLETED");
	});

	it("parses image tag", () => {
		const tags = [...fullTags(), ["image", "https://example.com/logo.png"]];
		const b = parseBountyEvent(makeEvent(tags));
		expect(b!.image).toBe("https://example.com/logo.png");
	});

	it("handles non-numeric reward gracefully", () => {
		const tags = fullTags({ reward: "not-a-number" });
		const b = parseBountyEvent(makeEvent(tags));
		expect(b).not.toBeNull();
		expect(b!.rewardSats).toBeNaN();
	});

	it("preserves event id and pubkey", () => {
		const ev = makeEvent(fullTags(), {
			id: "custom-id",
			pubkey: "custom-pubkey",
		});
		const b = parseBountyEvent(ev);
		expect(b!.id).toBe("custom-id");
		expect(b!.pubkey).toBe("custom-pubkey");
	});

	it("handles all status values", () => {
		for (const s of ["OPEN", "IN_PROGRESS", "COMPLETED", "CANCELLED"]) {
			const b = parseBountyEvent(makeEvent(fullTags({ status: s })));
			expect(b!.status).toBe(s);
		}
	});

	it("handles all category values", () => {
		for (const c of ["code", "design", "writing", "research", "other"]) {
			const b = parseBountyEvent(makeEvent(fullTags({ category: c })));
			expect(b!.category).toBe(c);
		}
	});
});

// ─── buildBountyTags ─────────────────────────────────────────

describe("buildBountyTags", () => {
	const input = {
		dTag: "bounty-001",
		title: "Build a relay",
		summary: "We need a fast relay",
		rewardSats: 100000,
		category: "code" as BountyCategory,
		lightning: "dev@getalby.com",
		tags: ["rust", "nostr"],
	};

	it("includes all required tags", () => {
		const tags = buildBountyTags(input);
		const tagMap = new Map(tags.map((t) => [t[0], t]));

		expect(tagMap.get("d")![1]).toBe("bounty-001");
		expect(tagMap.get("title")![1]).toBe("Build a relay");
		expect(tagMap.get("summary")![1]).toBe("We need a fast relay");
		expect(tagMap.get("reward")![1]).toBe("100000");
		expect(tagMap.get("reward")![2]).toBe("sats");
		expect(tagMap.get("status")![1]).toBe("OPEN");
		expect(tagMap.get("category")![1]).toBe("code");
		expect(tagMap.get("lightning")![1]).toBe("dev@getalby.com");
		expect(tagMap.has("published_at")).toBe(true);
	});

	it("includes topic tags", () => {
		const tags = buildBountyTags(input);
		const tTags = tags.filter((t) => t[0] === "t").map((t) => t[1]);
		expect(tTags).toEqual(["rust", "nostr"]);
	});

	it("includes expiry when provided", () => {
		const tags = buildBountyTags({ ...input, expiry: 1700100000 });
		const expiry = tags.find((t) => t[0] === "expiry");
		expect(expiry).toBeDefined();
		expect(expiry![1]).toBe("1700100000");
	});

	it("omits expiry when not provided", () => {
		const tags = buildBountyTags(input);
		const expiry = tags.find((t) => t[0] === "expiry");
		expect(expiry).toBeUndefined();
	});

	it("includes image when provided", () => {
		const tags = buildBountyTags({
			...input,
			image: "https://example.com/img.jpg",
		});
		const img = tags.find((t) => t[0] === "image");
		expect(img![1]).toBe("https://example.com/img.jpg");
	});

	it("initializes winner as empty string", () => {
		const tags = buildBountyTags(input);
		const winner = tags.find((t) => t[0] === "winner");
		expect(winner![1]).toBe("");
	});
});

// ─── Round-trip ──────────────────────────────────────────────

describe("round-trip: build → parse", () => {
	it("build tags then parse event reconstructs bounty", () => {
		const input = {
			dTag: "roundtrip-001",
			title: "Round-trip test",
			summary: "Testing build → parse",
			rewardSats: 75000,
			category: "research" as BountyCategory,
			lightning: "test@ln.tips",
			tags: ["bitcoin", "test"],
			expiry: 1700200000,
			image: "https://example.com/pic.webp",
		};

		const tags = buildBountyTags(input);
		const event = makeEvent(tags, {
			id: "rt-event-id",
			pubkey: "rt-pubkey",
			content: "Full description here.",
			created_at: 1700000000,
		});

		const bounty = parseBountyEvent(event);
		expect(bounty).not.toBeNull();
		expect(bounty!.dTag).toBe("roundtrip-001");
		expect(bounty!.title).toBe("Round-trip test");
		expect(bounty!.summary).toBe("Testing build → parse");
		expect(bounty!.rewardSats).toBe(75000);
		expect(bounty!.category).toBe("research");
		expect(bounty!.lightning).toBe("test@ln.tips");
		expect(bounty!.tags).toEqual(["bitcoin", "test"]);
		expect(bounty!.expiry).toBe(1700200000);
		expect(bounty!.image).toBe("https://example.com/pic.webp");
		expect(bounty!.status).toBe("OPEN");
		expect(bounty!.winner).toBeUndefined(); // empty string → undefined
	});
});

// ─── Constants ───────────────────────────────────────────────

describe("constants", () => {
	it("BOUNTY_KIND is 30402 (NIP-99)", () => {
		expect(BOUNTY_KIND).toBe(30402);
	});
});
