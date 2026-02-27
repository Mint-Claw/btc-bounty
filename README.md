# ⚡ BTC-Bounty

Bitcoin-native bounty platform built on NOSTR. Post work, get paid in sats.

## Status

**Phase 1 — Sprint 3 (Complete Flow)** ✅

- [x] Next.js 14 + TypeScript + Tailwind
- [x] NDK relay pool configuration (4 relays)
- [x] NIP-07 adapter (Alby, nos2x, Nostore)
- [x] Kind:30402 bounty event schema + parser
- [x] Bounty listing page (mock data)
- [x] Post bounty form with NIP-07 signing
- [x] NIP07Guard component (extension detection)
- [x] WebLN adapter for Lightning payments
- [ ] Live relay subscriptions (Sprint 2)
- [ ] Bounty detail page (Sprint 2)
- [ ] Apply modal (Sprint 2)

## Stack

- **Frontend:** Next.js 14, TypeScript, Tailwind CSS
- **Protocol:** NOSTR (kind:30402 Classified Listings)
- **Payments:** Lightning Network (WebLN + manual fallback)
- **Auth:** NIP-07 browser extensions (no accounts, no passwords)
- **Hosting:** Vercel (free tier, zero backend)

## Development

```bash
pnpm install
pnpm dev
```

## Architecture

100% client-side. NOSTR is the database. No backend, no API routes, no server-side secrets.

All private key operations are handled by the user's NIP-07 browser extension (Alby recommended).

## Event Schema

Bounties are kind:30402 (NIP-99 Classified Listings) with custom tags:

```
["reward", "50000", "sats"]
["status", "OPEN"]
["category", "code"]
["lightning", "user@getalby.com"]
```

## License

MIT

**Sprint 2** ✅
- [x] Live relay subscriptions (NDK)
- [x] Bounty detail page with full event rendering
- [x] Apply modal with NIP-07 signing

**Sprint 3** ✅
- [x] Applications list on bounty detail (kind:1 replies)
- [x] Mark Bounty Complete (US-005) — poster updates status via replaceable event
- [x] Pay via Lightning (US-006) — WebLN auto-pay + manual fallback
- [x] Winner display + poster detection via NIP-07
- [x] Relay list updated per OVERSEER directive (damus, nostr.band, nos.lol, snort.social)
- [x] Domain: mintclaw.dev
