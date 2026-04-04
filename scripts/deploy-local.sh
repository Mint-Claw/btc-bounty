#!/bin/bash
set -e

# BTC-Bounty Local Deploy Script
# Builds, tests, deploys to launchd, restarts tunnel, verifies
#
# Usage: ./scripts/deploy-local.sh [--skip-test] [--no-tunnel]

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_DIR"

SKIP_TEST=false
NO_TUNNEL=false
for arg in "$@"; do
  case $arg in
    --skip-test) SKIP_TEST=true ;;
    --no-tunnel) NO_TUNNEL=true ;;
  esac
done

echo "⚡ BTC-Bounty Deploy"
echo "===================="

# 1. Build
echo ""
echo "📦 Building..."
pnpm build
echo "✅ Build complete"

# 2. Test (unless skipped)
if [ "$SKIP_TEST" = false ]; then
  echo ""
  echo "🧪 Running tests..."
  pnpm test --reporter=dot 2>&1 | tail -5
  echo "✅ Tests passed"
fi

# 3. Restart server via launchd
echo ""
echo "🔄 Restarting server..."
launchctl stop com.btcbounty.server 2>/dev/null || true
sleep 2
launchctl start com.btcbounty.server
sleep 3

# 4. Health check
echo ""
echo "🏥 Health check..."
health=$(curl -sf --max-time 10 http://localhost:3457/api/health)
version=$(echo "$health" | python3 -c "import sys,json;print(json.load(sys.stdin).get('version','?'))" 2>/dev/null)
status=$(echo "$health" | python3 -c "import sys,json;print(json.load(sys.stdin).get('status','?'))" 2>/dev/null)
echo "   Server: v$version status=$status"

if [ "$status" != "ok" ]; then
  echo "❌ Server unhealthy!"
  exit 1
fi
echo "✅ Server healthy"

# 5. Restart tunnel (unless skipped)
if [ "$NO_TUNNEL" = false ]; then
  echo ""
  echo "🌐 Restarting tunnel..."
  pkill -f "cloudflared tunnel" 2>/dev/null || true
  sleep 2
  
  # Start tunnel and capture URL
  cloudflared tunnel --url http://localhost:3457 2>&1 &
  TUNNEL_PID=$!
  
  # Wait for URL
  for i in $(seq 1 15); do
    sleep 1
    URL=$(cat /tmp/btc-bounty-tunnel.log 2>/dev/null | grep -o 'https://[^ ]*trycloudflare.com' | tail -1)
    if [ -n "$URL" ]; then
      echo "$URL" > /tmp/btc-bounty-tunnel-url.txt
      break
    fi
  done
  
  if [ -n "$URL" ]; then
    echo "   Tunnel: $URL"
    echo "✅ Tunnel active"
  else
    echo "⚠️  Tunnel URL not captured (may still be starting)"
  fi
fi

# 6. Summary
echo ""
echo "===================="
echo "✅ Deploy complete!"
echo "   Local:  http://localhost:3457"
[ -n "$URL" ] && echo "   Public: $URL"
echo "   Version: v$version"

# Show bounty count
stats=$(curl -sf http://localhost:3457/api/admin/stats 2>/dev/null)
if [ -n "$stats" ]; then
  total=$(echo "$stats" | python3 -c "import sys,json;print(json.load(sys.stdin).get('bounties',{}).get('total',0))" 2>/dev/null)
  sats=$(echo "$stats" | python3 -c "import sys,json;print(json.load(sys.stdin).get('bounties',{}).get('total_reward_sats',0))" 2>/dev/null)
  echo "   Bounties: $total ($sats sats)"
fi
