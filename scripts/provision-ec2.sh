#!/usr/bin/env bash
# Bootstrap a fresh Ubuntu EC2 instance to run Paper Portfolio.
#
# Idempotent — safe to re-run. Does NOT touch DNS, TLS certs, or secrets;
# those are separate steps in MIGRATION.md because they need DNS to resolve first.
#
# Usage (on the new instance):
#   git clone https://github.com/kiddooboy/Paper-Portfolio.git ~/Paper-Portfolio
#   bash ~/Paper-Portfolio/scripts/provision-ec2.sh
set -euo pipefail

DOMAIN="${DOMAIN:-paperportfolio.in}"
UAT_DOMAIN="${UAT_DOMAIN:-uat.paperportfolio.in}"
REPO_DIR="${REPO_DIR:-$HOME/Paper-Portfolio}"
SWAP_GB="${SWAP_GB:-4}"

log() { echo -e "\n\033[1;36m==> $*\033[0m"; }

# ── 1. Swap ───────────────────────────────────────────────────────────────────
# The client's vite build peaks well above this box's RAM. Without swap the
# build gets OOM-killed partway through and docker compose leaves a broken image.
log "[1/6] Swap (${SWAP_GB}G)"
if [ -f /swapfile ]; then
  echo "    /swapfile already exists — skipping"
else
  sudo fallocate -l "${SWAP_GB}G" /swapfile
  sudo chmod 600 /swapfile
  sudo mkswap /swapfile
  sudo swapon /swapfile
  echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab >/dev/null
fi
# Prefer RAM, but let the kernel reach for swap during builds rather than OOM.
sudo sysctl -w vm.swappiness=20 >/dev/null
grep -q '^vm.swappiness' /etc/sysctl.conf || echo 'vm.swappiness=20' | sudo tee -a /etc/sysctl.conf >/dev/null
free -h

# ── 2. Packages ───────────────────────────────────────────────────────────────
log "[2/6] Packages (docker, nginx, certbot)"
sudo apt-get update -qq
sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -qq \
  docker.io docker-compose-v2 docker-buildx \
  nginx certbot python3-certbot-nginx git curl sqlite3

sudo systemctl enable --now docker
sudo systemctl enable --now nginx

# Lets the ubuntu user run docker without sudo (takes effect on next login).
sudo usermod -aG docker ubuntu || true

# ── 3. Firewall ───────────────────────────────────────────────────────────────
# Only SSH and HTTP(S) from outside. The app itself listens on 127.0.0.1:5000
# (see docker-compose.yml) so it is reachable only through nginx.
log "[3/6] Firewall"
sudo ufw allow OpenSSH >/dev/null
sudo ufw allow 'Nginx Full' >/dev/null
sudo ufw --force enable >/dev/null
sudo ufw status verbose

# ── 4. Repo ───────────────────────────────────────────────────────────────────
log "[4/6] Repo at ${REPO_DIR}"
if [ -d "${REPO_DIR}/.git" ]; then
  git -C "${REPO_DIR}" pull --ff-only || echo "    (pull skipped — resolve manually)"
else
  git clone https://github.com/kiddooboy/Paper-Portfolio.git "${REPO_DIR}"
fi
mkdir -p "${REPO_DIR}/server/data"

# ── 5. nginx site ─────────────────────────────────────────────────────────────
# Plain HTTP only at this stage. certbot rewrites this file to add TLS once the
# domain actually resolves here — running it before DNS cuts over will fail.
log "[5/6] nginx site for ${DOMAIN}"
sudo tee /etc/nginx/sites-available/paperportfolio >/dev/null <<NGINX
server {
    listen 80;
    listen [::]:80;
    server_name ${DOMAIN} www.${DOMAIN};

    # Long-lived SSE stream for live market data — must not be buffered or
    # closed by the proxy's default 60s read timeout.
    location /api/stocks/stream {
        proxy_pass http://127.0.0.1:5000;
        proxy_http_version 1.1;
        proxy_set_header Connection '';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_buffering off;
        proxy_cache off;
        proxy_read_timeout 24h;
        chunked_transfer_encoding off;
    }

    location / {
        proxy_pass http://127.0.0.1:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
        proxy_read_timeout 300s;
        client_max_body_size 10M;
    }
}
NGINX

sudo ln -sf /etc/nginx/sites-available/paperportfolio /etc/nginx/sites-enabled/paperportfolio
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx

# ── 6. Done ───────────────────────────────────────────────────────────────────
log "[6/6] Provisioned"
cat <<NEXT

Still to do by hand (see MIGRATION.md):

  1. Put secrets in place — these are gitignored and must NOT come from the repo:
       ${REPO_DIR}/server/.env
       ${REPO_DIR}/firebase-service-account.json
  2. Restore the database into ${REPO_DIR}/server/data/
  3. Build and start:
       cd ${REPO_DIR}
       sudo docker compose build          # build first — separate from recreate
       sudo docker compose up -d          # so a failed build can't kill a live container
  4. Point DNS at this box, wait for it to resolve, then:
       sudo certbot --nginx -d ${DOMAIN} -d www.${DOMAIN}
  5. Log out and back in so the 'docker' group applies (drops the need for sudo).

NEXT
