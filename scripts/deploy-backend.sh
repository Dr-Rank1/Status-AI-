#!/usr/bin/env bash
# Deploy or update the Status backend on Ubuntu with systemd.
#
# Usage:
#   sudo ./scripts/deploy-backend.sh
#   sudo INSTALL_DIR=/srv/status ./scripts/deploy-backend.sh
#
# Prerequisites: Node.js 20+, npm, psql, systemd
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BACKEND="$ROOT/backend"
INSTALL_DIR="${INSTALL_DIR:-/opt/status}"
SERVICE_NAME="${SERVICE_NAME:-status-backend}"
SERVICE_USER="${SERVICE_USER:-status}"
SERVICE_GROUP="${SERVICE_GROUP:-status}"
UNIT_SRC="$ROOT/deploy/status-backend.service"
UNIT_DST="/etc/systemd/system/${SERVICE_NAME}.service"

echo "=== Status Backend Deployment ==="
echo "Source:  $BACKEND"
echo "Install: $INSTALL_DIR/backend"
echo

if [[ "${EUID:-$(id -u)}" -ne 0 ]]; then
  echo "Run as root (sudo) so systemd units and service user can be configured." >&2
  exit 1
fi

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js 20+ is required." >&2
  exit 1
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "npm is required." >&2
  exit 1
fi

if ! id "$SERVICE_USER" >/dev/null 2>&1; then
  echo "Creating system user: $SERVICE_USER"
  useradd --system --home-dir "$INSTALL_DIR" --shell /usr/sbin/nologin "$SERVICE_USER"
fi

mkdir -p "$INSTALL_DIR/backend"
mkdir -p "$INSTALL_DIR/backend/uploads"

echo "--- Syncing backend files ---"
if command -v rsync >/dev/null 2>&1; then
  rsync -a --delete \
    --exclude node_modules \
    --exclude .env \
    --exclude uploads \
    "$BACKEND/" "$INSTALL_DIR/backend/"
else
  rm -rf "$INSTALL_DIR/backend"
  mkdir -p "$INSTALL_DIR/backend"
  cp -a "$BACKEND/." "$INSTALL_DIR/backend/"
  rm -rf "$INSTALL_DIR/backend/node_modules" "$INSTALL_DIR/backend/uploads"
fi

if [[ ! -f "$INSTALL_DIR/backend/.env" ]]; then
  if [[ -f "$BACKEND/.env" ]]; then
    cp "$BACKEND/.env" "$INSTALL_DIR/backend/.env"
    echo "Copied local .env to $INSTALL_DIR/backend/.env"
  else
    cp "$INSTALL_DIR/backend/.env.example" "$INSTALL_DIR/backend/.env"
    echo "Created $INSTALL_DIR/backend/.env from .env.example — edit secrets before production use."
  fi
fi

chown -R "$SERVICE_USER:$SERVICE_GROUP" "$INSTALL_DIR/backend"
chmod 600 "$INSTALL_DIR/backend/.env"

echo "--- Installing npm dependencies ---"
cd "$INSTALL_DIR/backend"
sudo -u "$SERVICE_USER" npm ci --omit=dev

echo "--- Running database migrations ---"
sudo -u "$SERVICE_USER" env ENV_FILE="$INSTALL_DIR/backend/.env" bash "$INSTALL_DIR/backend/scripts/run-migrations.sh"

echo "--- Installing systemd unit ---"
sed "s|/opt/status|$INSTALL_DIR|g; s|User=status|User=$SERVICE_USER|g; s|Group=status|Group=$SERVICE_GROUP|g" \
  "$UNIT_SRC" > "$UNIT_DST"

systemctl daemon-reload
systemctl enable "$SERVICE_NAME"
systemctl restart "$SERVICE_NAME"

echo
echo "--- Service status ---"
systemctl --no-pager status "$SERVICE_NAME" || true

echo
echo "Deployment complete."
echo "  Logs:    journalctl -u $SERVICE_NAME -f"
echo "  Health:  curl http://localhost:3000/api/v1/health/ready"
echo "  Metrics: curl http://localhost:3000/metrics"
echo "  Backup:  $INSTALL_DIR/scripts/backup.sh (or repo scripts/backup.sh)"
