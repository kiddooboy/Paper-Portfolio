#!/usr/bin/env bash
# Run on the EC2 instance to pull latest code and restart the server.
# Usage: bash scripts/deploy.sh
set -euo pipefail

REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_DIR"

echo "[deploy] Pulling latest code..."
git pull origin main

echo "[deploy] Building client..."
cd client && npm ci --prefer-offline && npm run build && cd ..

echo "[deploy] Building server..."
cd server && npm ci --prefer-offline && npm run build && cd ..

echo "[deploy] Restarting server with PM2..."
if pm2 list | grep -q "paper-portfolio"; then
  pm2 restart paper-portfolio --update-env
else
  pm2 start ecosystem.config.cjs
  pm2 save
fi

echo "[deploy] Done."
pm2 status paper-portfolio
