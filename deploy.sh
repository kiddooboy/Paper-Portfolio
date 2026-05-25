#!/usr/bin/env bash
# Deploy Paper Portfolio on the EC2 instance (pm2 + nginx).
# Usage (on the server):  cd ~/Paper-Portfolio && ./deploy.sh
set -euo pipefail

echo "==> Pulling latest code"
git pull

echo "==> Building client"
cd client
npm install
npm run build
cd ..

echo "==> Building server"
cd server
npm install
npm run build
cd ..

echo "==> Restarting pm2"
# Restart by app name if it exists, else (re)start it
if pm2 describe paper-portfolio >/dev/null 2>&1; then
  pm2 restart paper-portfolio --update-env
else
  ( cd server && pm2 start dist/index.js --name paper-portfolio )
fi
pm2 save

echo "==> Done. Recent logs:"
pm2 logs paper-portfolio --lines 20 --nostream || true
