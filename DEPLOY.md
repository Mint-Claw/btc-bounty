# BTC-Bounty Deployment Guide

## Status: READY TO DEPLOY ✅

Code, tests (534 unit + 51 E2E = 585 total), and build are clean. Just need access.

---

## Option A: Vercel (Fastest — 5 minutes)

### One-time setup (William)
```bash
# On any machine with a browser:
npm i -g vercel
vercel login
vercel link   # Select the btc-bounty project
vercel env add NEXT_PUBLIC_APP_URL  # production: https://btc-bounty.vercel.app
vercel env add BTCPAY_URL           # production: http://citadel.local (or Tor)
vercel env add BTCPAY_API_KEY       # from BTCPay admin
vercel env add BTCPAY_STORE_ID      # HEpsQhweBJjLVCEAV6anLFfWaaR4wtM7apV9iNkZoBCe
```

### OR give FORGE a token
```bash
vercel tokens create btc-bounty-deploy
# Then: echo "VERCEL_TOKEN=<token>" >> ~/.env  (on FORGE)
```

### FORGE deploys
```bash
vercel --prod --token $VERCEL_TOKEN
```

---

## Option B: CITADEL Docker (Self-hosted)

### One-time setup (William on CITADEL)
```bash
# 1. Add FORGE's SSH key
mkdir -p ~/.ssh
echo 'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIOHoRt9oA/d/lyWkGjwo+q9JhigfsM40rZ2UFvdIT2fI forge@mini' >> ~/.ssh/authorized_keys
chmod 600 ~/.ssh/authorized_keys

# 2. Verify
ssh citadel echo "works"   # From FORGE
```

### FORGE deploys
```bash
./scripts/deploy-remote.sh citadel
```

This will: rsync code → build Docker image → start container → health check.

---

## Option C: Quick Static Export (No server needed)

For a read-only bounty viewer (no API, no payments):
```bash
# In next.config.ts, add: output: "export"
pnpm build
# Upload .next/out/ to any static host (GitHub Pages, Netlify, S3)
```

⚠️ This loses: Agent API, BTCPay escrow, server-side signing.

---

## Option D: Fly.io (No William needed — $5/mo)

### Setup (FORGE or anyone)
```bash
# 1. Install flyctl
brew install flyctl   # or: curl -L https://fly.io/install.sh | sh

# 2. Auth (one-time — creates account if needed)
flyctl auth signup    # or: flyctl auth login

# 3. Launch from project root (uses fly.toml)
cd btc-bounty
flyctl launch --copy-config --no-deploy

# 4. Create persistent volume for SQLite
flyctl volumes create btcbounty_data --size 1 --region ord

# 5. Set secrets
flyctl secrets set \
  NEXT_PUBLIC_APP_URL=https://btc-bounty.fly.dev \
  BTCPAY_URL=https://citadel.local \
  BTCPAY_API_KEY=2ca41b03f56fefc1ca0a32ba5743ff783a0287c7 \
  BTCPAY_STORE_ID=HEpsQhweBJjLVCEAV6anLFfWaaR4wtM7apV9iNkZoBCe \
  ADMIN_SECRET=$(openssl rand -hex 32) \
  BTCBOUNTY_DATA_DIR=/data

# 6. Deploy
flyctl deploy

# 7. Verify
flyctl status
curl https://btc-bounty.fly.dev/api/health
```

### Costs
- shared-cpu-1x + 512MB RAM: ~$3.50/mo
- 1GB persistent volume: ~$0.15/mo
- **Total: ~$5/mo** (free tier covers first machine)

### Notes
- SQLite stored on persistent volume at `/data` (survives deploys)
- Auto-suspend on idle, auto-start on request (saves cost)
- Chicago region (ord) — closest to CITADEL for BTCPay webhooks
- Custom domain: `flyctl certs add btcbounty.com`

---

## Post-Deploy Checklist

1. **Smoke test**: `curl https://<domain>/api/health` → should return `{"status":"ok"}`
2. **Browse bounties**: Visit the homepage, verify bounties load from relays
3. **BTCPay**: Check `/api/health` for `btcpay.connected: true`
4. **Agent API**: `curl -H "X-API-Key: <key>" https://<domain>/api/bounties` 

---

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `NEXT_PUBLIC_APP_URL` | ✅ | Public URL (e.g. `https://btc-bounty.vercel.app`) |
| `NEXT_PUBLIC_RELAYS` | ✅ | Comma-separated NOSTR relay WSS URLs |
| `BTCPAY_URL` | For payments | BTCPay Server URL |
| `BTCPAY_API_KEY` | For payments | BTCPay API key |
| `BTCPAY_STORE_ID` | For payments | BTCPay store ID |
| `BTCPAY_WEBHOOK_SECRET` | For payments | Webhook HMAC secret |
| `AGENT_API_KEYS` | For agent API | Format: `key1:nsec1hex,key2:nsec2hex` |
| `BTCBOUNTY_DATA_DIR` | No (default `.data`) | SQLite + payment data directory |

---

## BTCPay Webhook Setup

After deploy, configure BTCPay to send webhooks:
1. BTCPay Admin → Store → Webhooks → Add
2. URL: `https://<domain>/api/webhooks/btcpay`
3. Events: `InvoiceSettled`, `InvoiceExpired`, `PayoutApproved`
4. Secret: set same as `BTCPAY_WEBHOOK_SECRET` env var
