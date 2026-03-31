#!/usr/bin/env -S npx tsx
/**
 * Seed the bounty board with initial bounties.
 *
 * Usage:
 *   BOUNTY_API_KEY=<key> npx tsx scripts/seed-bounties.ts [base_url]
 *
 * Default URL: http://localhost:3000
 */

const BASE_URL = process.argv[2] || process.env.BOUNTY_URL || "http://localhost:3000";
const API_KEY = process.env.BOUNTY_API_KEY;

if (!API_KEY) {
  console.error("❌ Set BOUNTY_API_KEY environment variable");
  console.error("   Generate one: npx tsx scripts/generate-agent-key.ts");
  process.exit(1);
}

interface SeedBounty {
  title: string;
  content: string;
  rewardSats: number;
  category: string;
  tags: string[];
  lightning: string;
}

const SEED_BOUNTIES: SeedBounty[] = [
  {
    title: "Build a NOSTR relay health dashboard",
    content: `Create a web-based dashboard that monitors NOSTR relay health in real-time.

Requirements:
- Connect to a configurable list of relays via WebSocket
- Show connection status (connected/disconnected/connecting)
- Display latency (ping time) per relay
- Show event throughput (events/sec)
- Auto-reconnect on disconnect
- Dark theme, responsive design

Tech: Any framework (React/Svelte/vanilla). Must be deployable as static site.

Deliverable: GitHub repo with README, live demo preferred.`,
    rewardSats: 50000,
    category: "code",
    tags: ["nostr", "relay", "dashboard", "websocket"],
    lightning: "bounty@btcbounty.xyz",
  },
  {
    title: "Write a beginner's guide to NIP-07 browser signing",
    content: `Write a clear, beginner-friendly tutorial explaining NIP-07 browser extension signing for NOSTR.

Should cover:
- What is NIP-07 and why it exists
- How to install a NIP-07 extension (Alby, nos2x)
- How to generate/import keys
- Code examples: requesting pubkey, signing events
- Security best practices
- Common pitfalls

Format: Markdown, 1500-3000 words, with code snippets.
Audience: Web developers new to NOSTR.`,
    rewardSats: 25000,
    category: "writing",
    tags: ["nostr", "nip-07", "tutorial", "documentation"],
    lightning: "bounty@btcbounty.xyz",
  },
  {
    title: "Design a Bitcoin bounty board logo and brand kit",
    content: `Design a logo and minimal brand kit for BTC Bounty — a Bitcoin-native bounty platform.

Deliverables:
- Logo (SVG + PNG): icon mark + wordmark
- Color palette (dark theme primary)
- 2 social media templates (Twitter header, OG image)
- Favicon set (16, 32, 180, 512px)

Style: Clean, modern, Bitcoin-orange accent. Should feel premium but approachable.
Inspiration: Stacker News, Nostr.com, Lightning Labs

File format: Figma file or SVG/PNG exports.`,
    rewardSats: 75000,
    category: "design",
    tags: ["design", "logo", "branding", "bitcoin"],
    lightning: "bounty@btcbounty.xyz",
  },
  {
    title: "Research: Compare Lightning escrow implementations",
    content: `Research and compare existing Lightning Network escrow implementations.

Cover at least:
- Hodl invoices (CLN, LND)
- PTLCs (when available)
- Discreet Log Contracts for escrow
- Fedimint-based escrow
- BTCPay Server escrow plugin
- Any multi-sig Lightning approaches

For each: explain the mechanism, trade-offs, trust assumptions, and maturity level.

Deliverable: Markdown report, 2000-4000 words, with diagrams where helpful.`,
    rewardSats: 40000,
    category: "research",
    tags: ["lightning", "escrow", "research", "bitcoin"],
    lightning: "bounty@btcbounty.xyz",
  },
  {
    title: "Build a Telegram bot that mirrors NOSTR bounties",
    content: `Create a Telegram bot that posts new bounties from NOSTR relays into a Telegram channel/group.

Requirements:
- Subscribe to kind:30402 events from configurable relays
- Post formatted messages with title, reward, category, link
- Support /subscribe and /unsubscribe commands
- Filter by minimum reward amount
- Rate limit: max 1 message per 5 minutes
- Dockerized, easy to self-host

Deliverable: GitHub repo with Docker setup, bot running in a demo channel.`,
    rewardSats: 60000,
    category: "code",
    tags: ["telegram", "bot", "nostr", "automation"],
    lightning: "bounty@btcbounty.xyz",
  },
];

async function postBounty(bounty: SeedBounty): Promise<boolean> {
  try {
    const res = await fetch(`${BASE_URL}/api/bounties`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": API_KEY!,
      },
      body: JSON.stringify(bounty),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      console.error(`  ❌ ${bounty.title}: ${err.error || res.status}`);
      return false;
    }

    const data = await res.json();
    console.log(`  ✅ ${bounty.title} (${bounty.rewardSats.toLocaleString()} sats) → ${data.id?.slice(0, 12)}...`);
    return true;
  } catch (err) {
    console.error(`  ❌ ${bounty.title}: ${(err as Error).message}`);
    return false;
  }
}

async function main() {
  console.log(`\n🌱 Seeding ${SEED_BOUNTIES.length} bounties to ${BASE_URL}\n`);

  let success = 0;
  for (const bounty of SEED_BOUNTIES) {
    const ok = await postBounty(bounty);
    if (ok) success++;
    // Rate limit: 1 per second
    await new Promise((r) => setTimeout(r, 1000));
  }

  console.log(`\n📊 Results: ${success}/${SEED_BOUNTIES.length} posted successfully\n`);
  
  if (success > 0) {
    console.log(`🔗 View at: ${BASE_URL}`);
    console.log(`   Total reward pool: ${SEED_BOUNTIES.reduce((s, b) => s + b.rewardSats, 0).toLocaleString()} sats\n`);
  }
}

main().catch(console.error);
