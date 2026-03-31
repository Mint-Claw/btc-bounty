#!/bin/bash
# deploy-remote.sh — Deploy btc-bounty to CITADEL from FORGE via SSH
#
# Usage: ./scripts/deploy-remote.sh [user@host]
# Default: citadel (uses ~/.ssh/config)

set -euo pipefail

TARGET="${1:-citadel}"

echo "🚀 Remote deploy to $TARGET"
echo "================================"

# Test SSH connectivity
echo "Testing SSH..."
ssh -o ConnectTimeout=5 "$TARGET" "echo 'SSH OK: $(hostname)'" || {
    echo "❌ Cannot SSH to $TARGET"
    echo ""
    echo "Fix: Add FORGE's public key to $TARGET"
    echo "  On CITADEL, run:"
    echo "    mkdir -p ~/.ssh && echo '$(cat ~/.ssh/id_ed25519.pub)' >> ~/.ssh/authorized_keys"
    exit 1
}

# Check Docker
echo "Checking Docker..."
ssh "$TARGET" "docker --version && docker compose version" || {
    echo "❌ Docker not found on $TARGET"
    exit 1
}

# Sync code
echo "Syncing code to $TARGET..."
rsync -avz --exclude=node_modules --exclude=.next --exclude=.git \
    ~/Projects/btc-bounty/ "$TARGET:~/btc-bounty/"

# Deploy on remote
echo "Building and starting..."
ssh "$TARGET" "cd ~/btc-bounty && bash scripts/deploy-citadel.sh"

# Run smoke test
echo ""
echo "Running smoke test..."
REMOTE_IP=$(ssh "$TARGET" "hostname -I | awk '{print \$1}'" 2>/dev/null || echo "192.168.0.13")
bash scripts/smoke-test.sh "http://${REMOTE_IP}:3000"
