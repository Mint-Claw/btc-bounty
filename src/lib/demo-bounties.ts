/**
 * Sample bounties for demo/offline mode.
 * Shown when relay connection fails or returns no bounties.
 */
import type { Bounty } from "@/lib/nostr/schema";

const now = Math.floor(Date.now() / 1000);

export const DEMO_BOUNTIES: Bounty[] = [
  {
    id: "demo-1",
    dTag: "demo-1",
    pubkey: "a".repeat(64),
    title: "Build a Lightning Address resolver in Rust",
    summary:
      "Need a lightweight Rust crate that resolves Lightning Addresses (user@domain.com) to LNURL pay endpoints.",
    content:
      "Build a Rust crate that:\n1. Takes a Lightning Address string\n2. Resolves the .well-known/lnurlp endpoint\n3. Returns the LNURL-pay metadata\n4. Supports async (tokio)\n\nMust include tests and docs.",
    rewardSats: 250000,
    status: "OPEN",
    category: "code",
    tags: ["rust", "lightning", "lnurl"],
    lightning: "",
    createdAt: now - 3600,
  },
  {
    id: "demo-2",
    dTag: "demo-2",
    pubkey: "b".repeat(64),
    title: "Design a Nostr client logo — dark theme",
    summary: "Looking for a minimal, modern logo for a new Nostr client. Purple/orange palette.",
    content:
      "Deliverables:\n- SVG logo (icon + wordmark)\n- Dark and light variants\n- Favicon set\n- Figma source file\n\nStyle: clean, geometric, slightly playful.",
    rewardSats: 100000,
    status: "OPEN",
    category: "design",
    tags: ["logo", "nostr", "branding"],
    lightning: "",
    createdAt: now - 7200,
  },
  {
    id: "demo-3",
    dTag: "demo-3",
    pubkey: "c".repeat(64),
    title: "Write a beginner guide to Zaps (NIP-57)",
    summary: "Clear, non-technical explainer of how Zaps work on Nostr for new users.",
    content:
      "Target audience: people who just joined Nostr and don't understand Zaps.\n\nCover:\n- What are Zaps?\n- How to set up a Lightning wallet\n- How to send your first Zap\n- Why Zaps matter for content creators\n\n1500-2000 words, friendly tone.",
    rewardSats: 50000,
    status: "IN_PROGRESS",
    category: "writing",
    tags: ["nostr", "zaps", "tutorial"],
    lightning: "",
    createdAt: now - 86400,
  },
  {
    id: "demo-4",
    dTag: "demo-4",
    pubkey: "d".repeat(64),
    title: "Benchmark Bitcoin Core v28 sync times",
    summary: "Run IBD benchmarks on 3 hardware configs and publish results.",
    content:
      "Need reproducible Initial Block Download benchmarks:\n1. Raspberry Pi 5 (8GB)\n2. Mini PC (N100, 16GB)\n3. Desktop (i5-13600K, 32GB)\n\nMeasure: total sync time, peak RAM, disk I/O, CPU usage.\nPublish results as a Nostr long-form post (NIP-23).",
    rewardSats: 500000,
    status: "OPEN",
    category: "research",
    tags: ["bitcoin", "benchmark", "hardware"],
    lightning: "",
    createdAt: now - 172800,
  },
  {
    id: "demo-5",
    dTag: "demo-5",
    pubkey: "e".repeat(64),
    title: "NIP-07 browser extension for Firefox",
    summary: "Port the Alby NIP-07 signer to a standalone Firefox extension.",
    content:
      "Create a minimal Firefox extension that:\n- Implements window.nostr (NIP-07)\n- Stores keys encrypted with a password\n- Shows a confirmation popup for each signing request\n- No external dependencies\n\nMust pass nos2x compatibility tests.",
    rewardSats: 1000000,
    status: "OPEN",
    category: "code",
    tags: ["firefox", "nip-07", "extension"],
    lightning: "",
    createdAt: now - 259200,
  },
];
