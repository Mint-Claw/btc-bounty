#!/usr/bin/env bash
# Deploy BTC Bounty to CITADEL
# Usage: ./scripts/deploy-citadel.sh [user@host]
#
# Assumes:
#   - CITADEL has Docker + Docker Compose installed
#   - BTCPay Server running on port 49392
#   - SSH access configured

set -euo pipefail

REMOTE="${1:-forge@citadel.local}"
DEPLOY_DIR="/opt/btc-bounty"
COMPOSE_FILE="docker-compose.prod.yml"

echo "🚀 Deploying BTC Bounty to ${REMOTE}..."

# 1. Ensure remote directory exists
ssh "$REMOTE" "sudo mkdir -p ${DEPLOY_DIR} && sudo chown \$(whoami) ${DEPLOY_DIR}"

# 2. Sync project files (exclude dev artifacts)
echo "📦 Syncing files..."
rsync -avz --delete \
  --exclude 'node_modules' \
  --exclude '.next' \
  --exclude '.git' \
  --exclude '.data' \
  --exclude '.env.local' \
  --exclude 'tests' \
  --exclude '*.md' \
  --exclude '.pytest_cache' \
  --include '.env' \
  ./ "${REMOTE}:${DEPLOY_DIR}/"

# 3. Create .env if it doesn't exist on remote
ssh "$REMOTE" "
  if [ ! -f ${DEPLOY_DIR}/.env ]; then
    echo '⚠️  No .env found — creating from example...'
    cp ${DEPLOY_DIR}/.env.example ${DEPLOY_DIR}/.env
    echo '📝 Edit ${DEPLOY_DIR}/.env on CITADEL before first run!'
    echo '   Required: BTCPAY_URL, BTCPAY_API_KEY, BTCPAY_STORE_ID'
    exit 1
  fi
"

# 4. Build and deploy
echo "🔨 Building and starting containers..."
ssh "$REMOTE" "
  cd ${DEPLOY_DIR}
  docker compose -f ${COMPOSE_FILE} up -d --build
"

# 5. Wait for health check
echo "⏳ Waiting for health check..."
sleep 10
ssh "$REMOTE" "
  curl -sf http://localhost:3000/api/health && echo ' ✅ Healthy!' || echo ' ❌ Health check failed'
"

echo ""
echo "🎉 Deployment complete!"
echo "   App: http://${REMOTE%%@*}:3000 (or http://citadel.local:3000)"
echo "   Health: http://citadel.local:3000/api/health"
echo "   BTCPay: http://citadel.local:49392"
