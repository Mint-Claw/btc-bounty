#!/bin/bash
# serve.sh — Start btc-bounty production server with Cloudflare tunnel
# Kills any existing server/tunnel processes first.

set -e
cd "$(dirname "$0")/.."

echo "🔪 Killing existing processes..."
pkill -9 -f "next-server" 2>/dev/null || true
pkill -9 -f "node.*server.js" 2>/dev/null || true
pkill -f cloudflared 2>/dev/null || true
sleep 2

# Ensure build exists
if [ ! -f .next/standalone/server.js ]; then
  echo "⚠️  No build found. Run: pnpm build"
  exit 1
fi

echo "🚀 Starting server on port ${PORT:-3457}..."

# Source local env vars if available
if [ -f .env.local ]; then
  set -a
  source .env.local
  set +a
fi

ENCRYPTION_SECRET="${ENCRYPTION_SECRET:-btcbounty-dev-2026}" \
PORT="${PORT:-3457}" \
node .next/standalone/server.js > /tmp/btc-bounty.log 2>&1 &
SERVER_PID=$!
sleep 5

# Verify server is running
if ! curl -sf http://localhost:${PORT:-3457}/api/health > /dev/null 2>&1; then
  echo "❌ Server failed to start. Check /tmp/btc-bounty.log"
  cat /tmp/btc-bounty.log | tail -10
  exit 1
fi

UPTIME=$(curl -s http://localhost:${PORT:-3457}/api/health | python3 -c "import sys,json;print(f'{json.load(sys.stdin)[\"uptime\"]:.0f}s')" 2>/dev/null || echo "?")
echo "✅ Server running (PID: $SERVER_PID, uptime: $UPTIME)"

# Start Cloudflare tunnel
if command -v cloudflared &> /dev/null; then
  echo "🌐 Starting Cloudflare tunnel..."
  npx cloudflared tunnel --url http://localhost:${PORT:-3457} 2>/tmp/cf-tunnel.log &
  sleep 12
  TUNNEL=$(grep -o 'https://[^ ]*trycloudflare.com' /tmp/cf-tunnel.log | head -1)
  if [ -n "$TUNNEL" ]; then
    echo "✅ Tunnel: $TUNNEL"
  else
    echo "⚠️  Tunnel may still be connecting. Check /tmp/cf-tunnel.log"
  fi
else
  echo "ℹ️  cloudflared not found — skipping tunnel"
fi

echo ""
echo "📊 Status:"
curl -s http://localhost:${PORT:-3457}/api/health | python3 -c "
import sys,json
d=json.load(sys.stdin)
print(f'  DB: {d[\"database\"][\"tables\"]} tables')
print(f'  Relays: {d[\"nostr\"][\"online\"]}/{d[\"nostr\"][\"total\"]} online')
print(f'  BTCPay: {\"connected\" if d[\"btcpay\"][\"connected\"] else \"not configured\"}')" 2>/dev/null || true

echo ""
echo "Server log: /tmp/btc-bounty.log"
echo "Tunnel log: /tmp/cf-tunnel.log"
