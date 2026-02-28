# BTC-Bounty — Sprint 4 Progress

**Date:** 2026-02-27
**Commit:** 430c657

## Completed

### ✅ NIP-01 Profile Display
- ProfileBadge component fetches kind:0 metadata async
- Shows avatar, display name, about text
- In-memory cache, graceful fallback to truncated pubkey
- Used on bounty detail (poster + applicants)

### ✅ Share-to-NOSTR
- ShareToNostr component on post success screen
- Publishes kind:1 note with bounty link and hashtags
- Opt-in (button, not automatic)
- Signs via NIP-07

### ✅ Mobile Responsive
- Listing, detail, post pages tested for 375px+
- Responsive padding, text sizes, flex-wrap on buttons
- Subtitle hidden on mobile, actions stack vertically

### ✅ README
- Complete: setup, env vars, deploy, security, tech stack
- Under 100 lines

### ✅ Security Audit
- `pnpm audit`: zero vulnerabilities
- No private key references in codebase (grep verified)
- DOMPurify sanitization on all NOSTR event content
- CSP headers in next.config.ts
- X-Frame-Options DENY, X-Content-Type-Options nosniff
- Largest bundle chunk: 420KB uncompressed

## Blockers

### ❌ Vercel Deploy
- No VERCEL_TOKEN env var set on FORGE
- Need William to either: set VERCEL_TOKEN, or deploy manually via `npx vercel` from btc-bounty dir
- Or connect the GitHub repo to Vercel for auto-deploys

### ❌ Interop Test
- Blocked on Vercel deploy — can't test nostrudel.ninja interop without a live URL
- Local testing with `pnpm dev` works fine

## Acceptance Criteria Status
- [x] NIP-01 profile shows on bounty detail
- [x] Share-to-NOSTR opt-in on post success
- [x] Mobile usable on 375px+
- [x] README complete
- [x] pnpm audit — zero high/critical
- [x] No private key exposure
- [x] CSP headers present
- [ ] Vercel preview deploy (needs VERCEL_TOKEN)
- [ ] nostrudel.ninja interop (needs deploy)
