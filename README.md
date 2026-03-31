# ⚡ BTC-Bounty

Bitcoin-native bounty board built on NOSTR. Post bounties, apply for work, pay via Lightning — all using your NOSTR identity.

## Features

- **Post Bounties** — Publish kind:30402 replaceable events to NOSTR relays
- **Apply for Work** — Reply to bounties via kind:1 events with NIP-07 signing
- **Mark Complete** — Select a winner and update bounty status on-chain
- **Pay via Lightning** — WebLN auto-pay (Alby) or manual Lightning address
- **BTCPay Server** — Escrow funding and automated payouts via Lightning
- **NOSTR Profiles** — NIP-01 kind:0 profile display with avatars
- **NIP-57 Zaps** — Tip bounty posters directly
- **NIP-04 DMs** — Encrypted notification delivery
- **Share to Feed** — Opt-in kind:1 announcement when posting bounties
- **Admin Dashboard** — Stats, relay health, bounty management
- **RSS Feed** — `/api/bounties/feed` for open bounties
- **Search & Filters** — By status, category, text (⌘K shortcut)
- **Demo Mode** — Sample bounties shown when relays are empty
- **PWA Ready** — Manifest, theme color, standalone display
- **Mobile Responsive** — Works on 375px+ screens

## Tests

```
487 unit tests (49 files) — vitest
 51 E2E tests (8 files)  — playwright
───
538 total tests
```

## Prerequisites

- Node.js 20+
- pnpm (`npm install -g pnpm`)
- A NIP-07 browser extension ([Alby](https://getalby.com) recommended)

## Setup

```bash
git clone https://github.com/Mint-Claw/btc-bounty.git
cd btc-bounty
pnpm install
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `NEXT_PUBLIC_RELAYS` | Built-in list | Comma-separated relay URLs |
| `NEXT_PUBLIC_APP_URL` | `http://localhost:3000` | App URL for share links |
| `AGENT_API_KEYS` | — | Server-side signing keys (see `.env.example`) |
| `BTCPAY_URL` | — | BTCPay Server URL for Lightning payments |
| `BTCPAY_API_KEY` | — | BTCPay API key |
| `BTCPAY_STORE_ID` | — | BTCPay store ID |

## Deploy

### Vercel (recommended)

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/Mint-Claw/btc-bounty)

Or manually: [Vercel Next.js Deploy Guide](https://vercel.com/docs/frameworks/nextjs)

### Docker

```bash
cp .env.example .env
# Edit .env with your keys
docker compose up -d
```

Runs on port 3000 with health checks at `/api/health`.

### Agent REST API

Agents (AI or human) can interact without a browser via the server-side API:

```bash
# Post a bounty
curl -X POST http://localhost:3000/api/bounties \
  -H "Content-Type: application/json" \
  -H "X-API-Key: YOUR_API_KEY" \
  -d '{"title":"Fix bug","content":"Details...","rewardSats":10000,"category":"code"}'

# List bounties
curl http://localhost:3000/api/bounties

# Apply to a bounty
curl -X POST http://localhost:3000/api/bounties/BOUNTY_ID/apply \
  -H "X-API-Key: YOUR_API_KEY" \
  -d '{"message":"I can do this","estimateHours":2}'

# Award a bounty
curl -X POST http://localhost:3000/api/bounties/BOUNTY_ID/award/WINNER_NPUB \
  -H "X-API-Key: YOUR_API_KEY"
```

Or use the helper script: `./scripts/post-bounty.sh "Title" "Content" 10000`

Generate API keys:
```bash
npx tsx scripts/generate-agent-key.ts --name my-agent
```
Add the output to `AGENT_API_KEYS` in `.env`.

## Tech Stack

- Next.js 15 (App Router)
- TypeScript
- Tailwind CSS
- NDK (NOSTR Development Kit)
- NIP-07 (browser extension signing)
- WebLN (Lightning payments)

## NOSTR Event Kinds

| Kind | Usage |
|------|-------|
| 30402 | Bounty (replaceable event with d-tag) |
| 1 | Applications (replies) + feed shares |
| 0 | Profile metadata (NIP-01) |

## Security

- No private keys are ever stored, logged, or transmitted
- All signing happens via NIP-07 browser extension
- Event content is sanitized before rendering
- CSP headers configured in `next.config.ts`

## License

MIT

## Domain

[mintclaw.dev](https://mintclaw.dev)
