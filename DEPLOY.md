# BTC Bounty — Deploy Guide

## Current Status
- ✅ Running locally on Mac Mini (launchd auto-restart)
- ✅ Publicly accessible via Cloudflare quick tunnel (ephemeral URL)
- ✅ 365+ bounties synced from NOSTR relays
- ⬜ Stable URL (needs Cloudflare auth or domain)
- ⬜ BTCPay escrow (CITADEL still 503)

## Quick Local Deploy
```bash
./scripts/deploy-local.sh          # full: build → test → restart → tunnel
./scripts/deploy-local.sh --skip-test  # fast: skip tests
```

## Get a Stable URL (William TODO)
Option A — Cloudflare Named Tunnel (free, permanent URL):
```bash
cloudflared login                  # opens browser, authenticates
cloudflared tunnel create btc-bounty
cloudflared tunnel route dns btc-bounty bounty.yourdomain.com
cloudflared tunnel run --url http://localhost:3457 btc-bounty
```

Option B — Vercel (free tier):
```bash
vercel login                       # opens browser
cd ~/Projects/btc-bounty && vercel --prod
# Set env vars in Vercel dashboard (BTCPAY_URL, BTCPAY_API_KEY, etc.)
```

Option C — Fly.io ($0-5/mo):
```bash
flyctl auth login
cd ~/Projects/btc-bounty && flyctl deploy
```

---

## Status: READY TO DEPLOY ✅
- Build: passes
- Tests: 568/568 passing
- TypeScript: clean

## Option 1: Vercel (Recommended — Fastest)
```bash
# One-time auth:
vercel login

# Deploy:
cd ~/Projects/btc-bounty
vercel --prod
```
Env vars to set in Vercel dashboard:
- `BTCPAY_URL` = https://citadel.local (or Tor URL)
- `BTCPAY_API_KEY` = 2ca41b03f56fefc1ca0a32ba5743ff783a0287c7
- `BTCPAY_STORE_ID` = HEpsQhweBJjLVCEAV6anLFfWaaR4wtM7apV9iNkZoBCe
- `BTCPAY_WEBHOOK_SECRET` = (set when creating webhook in BTCPay)

## Option 2: Fly.io
```bash
flyctl auth login
cd ~/Projects/btc-bounty
flyctl deploy
```

## Option 3: CITADEL Docker
```bash
# First set up SSH key:
ssh-copy-id citadel@192.168.0.13

# Then:
cd ~/Projects/btc-bounty
docker compose -f docker-compose.prod.yml build
# scp or docker push to CITADEL, then docker compose up -d
```

## Post-Deploy
1. Set up BTCPay webhook: Store → Webhooks → `https://<domain>/api/webhooks/btcpay`
2. Smoke test: browse bounties at public URL
3. Test escrow flow with small amount
