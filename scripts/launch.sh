#!/usr/bin/env bash
# ═══════════════════════════════════════════════════
# BTC-Bounty Launch Script
# One command to validate → build → deploy → smoke test
#
# Usage:
#   ./scripts/launch.sh vercel    # Deploy to Vercel
#   ./scripts/launch.sh fly       # Deploy to Fly.io
#   ./scripts/launch.sh docker    # Build + run Docker locally
# ═══════════════════════════════════════════════════

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
CYAN='\033[0;36m'
NC='\033[0m'

TARGET="${1:-}"
PASS=0
FAIL=0

step() { echo -e "\n${CYAN}→ $1${NC}"; }
ok()   { echo -e "  ${GREEN}✓ $1${NC}"; ((PASS++)); }
fail() { echo -e "  ${RED}✗ $1${NC}"; ((FAIL++)); }
warn() { echo -e "  ${YELLOW}⚠ $1${NC}"; }

if [ -z "$TARGET" ]; then
  echo "Usage: ./scripts/launch.sh <vercel|fly|docker>"
  echo ""
  echo "  vercel  — Deploy to Vercel (requires VERCEL_TOKEN or vercel login)"
  echo "  fly     — Deploy to Fly.io (requires flyctl auth)"
  echo "  docker  — Build + run Docker container locally"
  exit 1
fi

# ─── Pre-flight checks ────────────────────────────────
step "Pre-flight checks"

# Node version
NODE_V=$(node -v 2>/dev/null || echo "none")
if [[ "$NODE_V" =~ ^v(1[89]|2[0-9]) ]]; then
  ok "Node $NODE_V"
else
  fail "Node $NODE_V (need 18+)"
fi

# pnpm
if command -v pnpm &>/dev/null; then
  ok "pnpm $(pnpm -v)"
else
  fail "pnpm not found"
fi

# Git clean?
if [ -z "$(git status --porcelain 2>/dev/null)" ]; then
  ok "Git working tree clean"
else
  warn "Git has uncommitted changes"
fi

# ─── Tests ─────────────────────────────────────────────
step "Running test suite"
if pnpm test --reporter=dot 2>&1 | tail -5 | grep -q "passed"; then
  TEST_COUNT=$(pnpm test --reporter=dot 2>&1 | grep -oE '[0-9]+ passed' | head -1)
  ok "Tests: $TEST_COUNT"
else
  fail "Tests failed"
  echo "Run 'pnpm test' for details."
  exit 1
fi

# ─── Build ─────────────────────────────────────────────
step "Building application"
if pnpm build 2>&1 | tail -3 | grep -qE "Route|Generating"; then
  ok "Build successful"
else
  fail "Build failed"
  echo "Run 'pnpm build' for details."
  exit 1
fi

# ─── Deploy ────────────────────────────────────────────
step "Deploying to $TARGET"

case "$TARGET" in
  vercel)
    if ! command -v vercel &>/dev/null; then
      fail "vercel CLI not found. Run: npm i -g vercel"
      exit 1
    fi
    echo "  Deploying to Vercel (production)..."
    DEPLOY_URL=$(vercel --prod --yes 2>&1 | grep -oE 'https://[^ ]+' | head -1)
    if [ -n "$DEPLOY_URL" ]; then
      ok "Deployed: $DEPLOY_URL"
    else
      fail "Vercel deploy failed"
      exit 1
    fi
    ;;

  fly)
    if ! command -v flyctl &>/dev/null; then
      fail "flyctl not found. Run: brew install flyctl"
      exit 1
    fi
    # Create app if it doesn't exist
    if ! flyctl status 2>/dev/null | grep -q "App"; then
      echo "  Creating Fly.io app..."
      flyctl launch --no-deploy --yes 2>/dev/null || true
    fi
    echo "  Deploying to Fly.io..."
    if flyctl deploy --yes 2>&1 | tail -5 | grep -q "started successfully"; then
      DEPLOY_URL=$(flyctl info --json 2>/dev/null | grep -oE '"hostname": "[^"]+"' | head -1 | cut -d'"' -f4)
      ok "Deployed: https://$DEPLOY_URL"
    else
      fail "Fly.io deploy failed"
      exit 1
    fi
    ;;

  docker)
    echo "  Building Docker image..."
    if docker build -t btc-bounty:latest . 2>&1 | tail -3 | grep -q "exporting to image"; then
      ok "Docker image built: btc-bounty:latest"
    else
      # Try again, sometimes grep misses output
      docker build -t btc-bounty:latest .
      ok "Docker image built: btc-bounty:latest"
    fi

    echo "  Starting container on port 3000..."
    docker rm -f btc-bounty 2>/dev/null || true
    docker run -d --name btc-bounty -p 3000:3000 \
      -v btc-bounty-data:/data \
      -e BTCBOUNTY_DATA_DIR=/data \
      btc-bounty:latest

    # Wait for health
    sleep 5
    DEPLOY_URL="http://localhost:3000"
    ok "Container running at $DEPLOY_URL"
    ;;

  *)
    fail "Unknown target: $TARGET"
    echo "  Use: vercel, fly, or docker"
    exit 1
    ;;
esac

# ─── Smoke test ────────────────────────────────────────
if [ -n "${DEPLOY_URL:-}" ]; then
  step "Smoke testing $DEPLOY_URL"

  # Health check
  if curl -sf "$DEPLOY_URL/api/health" | grep -q '"status"'; then
    ok "Health endpoint"
  else
    warn "Health endpoint not responding (may need a few seconds to warm up)"
  fi

  # API version
  if curl -sf "$DEPLOY_URL/api/version" | grep -q '"version"'; then
    ok "Version endpoint"
  else
    warn "Version endpoint failed"
  fi

  # Bounties list
  if curl -sf "$DEPLOY_URL/api/bounties" | grep -q '"bounties"\|[]'; then
    ok "Bounties API"
  else
    warn "Bounties API not responding"
  fi

  # Homepage
  HTTP_CODE=$(curl -sf -o /dev/null -w "%{http_code}" "$DEPLOY_URL/" || echo "000")
  if [ "$HTTP_CODE" = "200" ]; then
    ok "Homepage loads (200)"
  else
    warn "Homepage returned $HTTP_CODE"
  fi
fi

# ─── Summary ───────────────────────────────────────────
echo ""
echo "═══════════════════════════════════════"
echo -e "  ${GREEN}✓ $PASS passed${NC}  ${RED}✗ $FAIL failed${NC}"
if [ -n "${DEPLOY_URL:-}" ]; then
  echo -e "  ${CYAN}🚀 Live at: $DEPLOY_URL${NC}"
fi
echo "═══════════════════════════════════════"

if [ "$FAIL" -gt 0 ]; then
  exit 1
fi
