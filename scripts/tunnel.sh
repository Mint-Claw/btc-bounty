#!/bin/bash
# tunnel.sh — Manage Cloudflare quick tunnel for btc-bounty
# Usage: tunnel.sh [start|stop|status|url]

set -e
PORT="${PORT:-3457}"
URL_FILE="/tmp/btc-bounty-tunnel-url.txt"
PID_FILE="/tmp/btc-bounty-tunnel.pid"
LOG_FILE="/tmp/btc-bounty-tunnel.log"

start() {
  # Kill existing tunnel
  if [ -f "$PID_FILE" ]; then
    kill "$(cat $PID_FILE)" 2>/dev/null || true
    rm -f "$PID_FILE"
  fi
  pkill -f "cloudflared.*localhost:${PORT}" 2>/dev/null || true
  sleep 1

  if ! curl -sf "http://localhost:${PORT}/api/health" > /dev/null 2>&1; then
    echo "❌ Server not running on port ${PORT}"
    exit 1
  fi

  echo "🌐 Starting Cloudflare tunnel → localhost:${PORT}..."
  cloudflared tunnel --url "http://localhost:${PORT}" > "$LOG_FILE" 2>&1 &
  echo $! > "$PID_FILE"

  # Wait for URL to appear (up to 30s)
  for i in $(seq 1 30); do
    URL=$(grep -o 'https://[^ ]*trycloudflare.com' "$LOG_FILE" 2>/dev/null | head -1)
    if [ -n "$URL" ]; then
      echo "$URL" > "$URL_FILE"
      echo "✅ Tunnel live: $URL"
      # Verify it works
      HTTP=$(curl -s -o /dev/null -w "%{http_code}" "${URL}/api/health" 2>/dev/null || echo "000")
      if [ "$HTTP" = "200" ]; then
        echo "✅ Health check: 200 OK"
      else
        echo "⚠️  Health check: $HTTP (may need a moment)"
      fi
      return 0
    fi
    sleep 1
  done

  echo "❌ Tunnel failed to start. Check $LOG_FILE"
  return 1
}

stop() {
  if [ -f "$PID_FILE" ]; then
    kill "$(cat $PID_FILE)" 2>/dev/null && echo "✅ Tunnel stopped" || echo "⚠️  Process already dead"
    rm -f "$PID_FILE" "$URL_FILE"
  else
    pkill -f "cloudflared.*localhost:${PORT}" 2>/dev/null && echo "✅ Tunnel stopped" || echo "ℹ️  No tunnel running"
  fi
}

status() {
  if [ -f "$URL_FILE" ]; then
    URL=$(cat "$URL_FILE")
    HTTP=$(curl -s -o /dev/null -w "%{http_code}" "${URL}/api/health" 2>/dev/null || echo "000")
    if [ "$HTTP" = "200" ]; then
      echo "✅ Tunnel: $URL (healthy)"
    else
      echo "⚠️  Tunnel: $URL (unhealthy: $HTTP)"
    fi
  else
    echo "ℹ️  No tunnel URL recorded"
  fi

  # Check process
  if [ -f "$PID_FILE" ] && kill -0 "$(cat $PID_FILE)" 2>/dev/null; then
    echo "📡 Process: running (PID $(cat $PID_FILE))"
  else
    echo "📡 Process: not running"
  fi

  # Local server
  if curl -sf "http://localhost:${PORT}/api/health" > /dev/null 2>&1; then
    VER=$(curl -s "http://localhost:${PORT}/api/version" | python3 -c "import sys,json;print(json.load(sys.stdin)['version'])" 2>/dev/null || echo "?")
    echo "🖥️  Server: running on :${PORT} (v${VER})"
  else
    echo "🖥️  Server: not running"
  fi
}

url() {
  if [ -f "$URL_FILE" ]; then
    cat "$URL_FILE"
  else
    # Try to find from running tunnel log
    URL=$(grep -o 'https://[^ ]*trycloudflare.com' "$LOG_FILE" 2>/dev/null | head -1)
    if [ -n "$URL" ]; then
      echo "$URL" > "$URL_FILE"
      echo "$URL"
    else
      echo "No tunnel URL found" >&2
      return 1
    fi
  fi
}

case "${1:-status}" in
  start)  start ;;
  stop)   stop ;;
  status) status ;;
  url)    url ;;
  *)      echo "Usage: tunnel.sh [start|stop|status|url]" ;;
esac
