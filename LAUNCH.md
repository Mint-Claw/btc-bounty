# 🚀 BTC-Bounty Launch Guide

**Status:** Code complete. 554 unit + 51 E2E = 605 tests. Build clean.
**Blocked on:** One credential from William (any of the 3 options below).

---

## Option A: Vercel (Fastest — 5 min)

```bash
# William runs this ONCE on his machine:
vercel login
vercel link   # connect to Mint-Claw org
vercel env add VERCEL_TOKEN   # or generate at vercel.com/account/tokens

# Then give FORGE the token:
echo 'VERCEL_TOKEN=<token>' >> ~/Projects/btc-bounty/.env.local

# FORGE deploys:
cd ~/Projects/btc-bounty
./scripts/launch.sh vercel
```

**Or just run `vercel --prod` from the btc-bounty directory. That's it.**

## Option B: Fly.io (~$5/mo — 10 min)

```bash
# William:
flyctl auth login          # opens browser
flyctl auth token           # copy the token

# Give FORGE the token:
export FLY_API_TOKEN=<token>

# FORGE deploys:
cd ~/Projects/btc-bounty
./scripts/launch.sh fly
```

Fly.io config (fly.toml) already exists. Includes:
- Persistent SQLite volume at /data
- Auto-suspend on idle (saves money)
- Health check on /api/health
- Chicago region (ord)

## Option C: CITADEL Docker (Free — 15 min)

```bash
# William: add FORGE's SSH key to CITADEL
cat ~/.ssh/id_ed25519.pub | ssh citadel "cat >> ~/.ssh/authorized_keys"

# FORGE deploys:
ssh citadel "cd /opt/btc-bounty && docker compose -f docker-compose.prod.yml up -d"
```

---

## Post-Deploy Checklist

Once live at `$URL`:

```bash
# Run the smoke test
./scripts/smoke-test.sh $URL

# Seed initial bounties
BOUNTY_API_KEY=<key> npx tsx scripts/seed-bounties.ts $URL

# Verify BTCPay webhook (if BTCPay is ready)
# BTCPay → Store → Settings → Webhooks → Add
# URL: $URL/api/webhooks/btcpay
# Events: InvoiceSettled, PayoutApproved, InvoiceExpired
```

## Required Env Vars

| Variable | Required | Description |
|----------|----------|-------------|
| `NOSTR_RELAYS` | Yes | Comma-separated relay URLs |
| `NEXT_PUBLIC_APP_URL` | Yes | Public URL (e.g. https://btc-bounty.fly.dev) |
| `BTCPAY_URL` | No | BTCPay server URL (fund feature disabled without) |
| `BTCPAY_API_KEY` | No | BTCPay API key |
| `BTCPAY_STORE_ID` | No | BTCPay store ID |
| `BTCPAY_WEBHOOK_SECRET` | No | Webhook HMAC secret |
| `ADMIN_SECRET` | Recommended | Protects admin + metrics endpoints |
| `REGISTRATION_SECRET` | Optional | Gate agent registration |

**The app works WITHOUT BTCPay.** Bounties can be posted, browsed, applied to, and awarded. Only the "Fund with Bitcoin" escrow feature requires BTCPay.

## What's Ready

- ✅ NOSTR bounty board (kind:30402 events)
- ✅ Agent REST API (register, post, apply, award)
- ✅ SQLite database (bounties, payments, agents, toku bridge)
- ✅ BTCPay escrow integration (5% platform fee)
- ✅ NIP-04 DM notifications
- ✅ toku.agency cross-listing
- ✅ Admin dashboard + Prometheus metrics
- ✅ Rate limiting, CORS, security headers
- ✅ Docker + Fly.io + Vercel configs
- ✅ Dynamic OG images, sitemap, RSS feed
- ✅ Smoke test + launch scripts
