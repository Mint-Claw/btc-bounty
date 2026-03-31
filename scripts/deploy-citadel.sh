#!/bin/bash
# deploy-citadel.sh — One-command deployment to CITADEL
#
# Prerequisites:
#   1. Run this ON CITADEL (or SSH into it first)
#   2. Docker + Docker Compose installed
#   3. Git access to the repo
#
# Usage:
#   curl -sL <raw-github-url> | bash
#   OR: git clone ... && cd btc-bounty && bash scripts/deploy-citadel.sh
#
# This script:
#   1. Clones/pulls the latest btc-bounty code
#   2. Creates .env from template if missing
#   3. Builds and starts the Docker container
#   4. Runs smoke test
#   5. Prints the access URL

set -euo pipefail

REPO="https://github.com/Mint-Claw/btc-bounty.git"
DEPLOY_DIR="${HOME}/btc-bounty"
COMPOSE_FILE="docker-compose.prod.yml"

echo "🚀 BTC-Bounty Deployment Script"
echo "================================"
echo ""

# Step 1: Get the code
if [ -d "$DEPLOY_DIR" ]; then
    echo "📦 Updating existing deployment..."
    cd "$DEPLOY_DIR"
    git pull --ff-only origin main
else
    echo "📦 Cloning repository..."
    git clone "$REPO" "$DEPLOY_DIR"
    cd "$DEPLOY_DIR"
fi

# Step 2: Environment file
if [ ! -f .env ]; then
    echo "📝 Creating .env from template..."
    cp .env.example .env
    
    # Auto-fill known values
    sed -i 's|NEXT_PUBLIC_APP_URL=.*|NEXT_PUBLIC_APP_URL=http://'"$(hostname -I | awk '{print $1}')"':3000|' .env
    sed -i 's|BTCPAY_URL=.*|BTCPAY_URL=http://citadel.local|' .env
    sed -i 's|BTCPAY_STORE_ID=.*|BTCPAY_STORE_ID=HEpsQhweBJjLVCEAV6anLFfWaaR4wtM7apV9iNkZoBCe|' .env
    sed -i 's|BTCPAY_API_KEY=.*|BTCPAY_API_KEY=2ca41b03f56fefc1ca0a32ba5743ff783a0287c7|' .env
    
    echo "   ⚠️  Review .env and update AGENT_API_KEYS before going live"
else
    echo "✅ .env exists"
fi

# Step 3: Build and deploy
echo ""
echo "🔨 Building Docker image..."
docker compose -f "$COMPOSE_FILE" build --no-cache

echo ""
echo "🚀 Starting container..."
docker compose -f "$COMPOSE_FILE" up -d

# Step 4: Wait for health check
echo ""
echo "⏳ Waiting for health check..."
for i in $(seq 1 30); do
    if curl -sf http://localhost:3000/api/health > /dev/null 2>&1; then
        echo "✅ Health check passed!"
        break
    fi
    if [ "$i" -eq 30 ]; then
        echo "❌ Health check failed after 30s"
        echo "   Check logs: docker compose -f $COMPOSE_FILE logs"
        exit 1
    fi
    sleep 1
    echo -n "."
done

# Step 5: Print status
echo ""
echo "================================"
echo "✅ BTC-Bounty is LIVE!"
echo ""
LOCAL_IP=$(hostname -I 2>/dev/null | awk '{print $1}' || echo "localhost")
echo "   Local:    http://localhost:3000"
echo "   Network:  http://${LOCAL_IP}:3000"
echo "   Health:   http://${LOCAL_IP}:3000/api/health"
echo "   API Docs: http://${LOCAL_IP}:3000/docs"
echo ""
echo "📋 Next steps:"
echo "   1. Browse to the URL above and verify bounties load"
echo "   2. Set up AGENT_API_KEYS in .env for agent access"
echo "   3. Configure BTCPay webhook: ${LOCAL_IP}:3000/api/webhooks/btcpay"
echo ""
echo "🔧 Management:"
echo "   Logs:    docker compose -f $COMPOSE_FILE logs -f"
echo "   Stop:    docker compose -f $COMPOSE_FILE down"
echo "   Restart: docker compose -f $COMPOSE_FILE restart"
echo "================================"
