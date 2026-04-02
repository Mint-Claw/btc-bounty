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

# Copy static assets into standalone (Next.js standalone doesn't include them)
echo "📦 Copying static assets..."
cp -r .next/static .next/standalone/.next/static 2>/dev/null || true
cp -r public .next/standalone/public 2>/dev/null || true

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
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
if command -v cloudflared &> /dev/null; then
  "$SCRIPT_DIR/tunnel.sh" start
else
  echo "ℹ️  cloudflared not found — skipping tunnel"
fi

echo ""
echo "📊 Full Status:"
"$SCRIPT_DIR/tunnel.sh" status
echo ""
echo "Server log: /tmp/btc-bounty.log"
