# BTCBOUNTY Fly.io Public-Alpha Hosting Guide

Status: prepared; owner auth required

## Why Fly.io first

BTCBOUNTY uses Next.js standalone output plus `better-sqlite3`. Fly.io can run the Node container with a persistent `/data` volume, which is a better fit for public alpha than serverless-only hosting.

## Owner steps required

Run these on FORGE or another machine with the repo checkout.

1. Log in to Fly:

```bash
flyctl auth login
```

2. Choose/create the app name. If `btcbounty-public-alpha` is available, keep `fly.toml` as-is. Otherwise run:

```bash
flyctl apps create YOUR_AVAILABLE_APP_NAME
```

Then edit `fly.toml`:

```toml
app = "YOUR_AVAILABLE_APP_NAME"
```

3. Create the persistent SQLite volume:

```bash
flyctl volumes create btcbounty_data --size 1 --region iad
```

4. Set public app URL:

```bash
flyctl secrets set APP_URL="https://YOUR_AVAILABLE_APP_NAME.fly.dev"
```

5. Deploy:

```bash
flyctl deploy
```

6. Verify public routes:

```bash
curl -fsS https://YOUR_AVAILABLE_APP_NAME.fly.dev/ >/dev/null
curl -fsS https://YOUR_AVAILABLE_APP_NAME.fly.dev/agents >/dev/null
curl -fsS https://YOUR_AVAILABLE_APP_NAME.fly.dev/api/agent-discovery/bounties?limit=1
```

7. Send Hermes the public URL and verification output. Hermes can then finish Nostr/MOLTBOOK posting receipts and update status reports.

## Secrets note

Do not paste BTCPay API keys, webhook secrets, Nostr private keys, wallet seeds, or GitHub tokens into chat. If a deployment needs secrets, set them with `flyctl secrets set NAME=...` locally and only report presence/status.

## Rollback

```bash
flyctl releases
flyctl deploy --image <previous-image>
```

For public alpha, do not expose unattended funding/settlement operations until BTCBOUNTY has another verified real bounty flow.
