# Phase 40 — Ubuntu / Linux ambient cognitive fabric bridge
#
# Soft background context pulses for desktop Linux (no wake word).
# Wired to Flutter via MethodChannel when a linux runner embeds the plugin;
# this script also posts ambient ticks to the API for headless Ubuntu agents.
#
# Usage:
#   AMBIENT_API_BASE=http://127.0.0.1:3000 AMBIENT_JWT=… ./scripts/ambient_ubuntu_bridge.sh
#   DRY_RUN=1 ./scripts/ambient_ubuntu_bridge.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
API_BASE="${AMBIENT_API_BASE:-http://127.0.0.1:3000}"
INTERVAL_SEC="${AMBIENT_INTERVAL_SEC:-20}"
DRY_RUN="${DRY_RUN:-0}"

log() { echo "[ambient-ubuntu $(date -u +%Y-%m-%dT%H:%M:%SZ)] $*"; }

if [[ -f /etc/os-release ]]; then
  # shellcheck disable=SC1091
  . /etc/os-release
  log "host=${ID:-linux} ${VERSION_ID:-}"
fi

pulse() {
  local payload
  payload=$(cat <<EOF
{"transcript":"ubuntu ambient pulse $(hostname) $(date +%H:%M)","activity":"desktop","locationLabel":"ubuntu"}
EOF
)
  if [[ "$DRY_RUN" == "1" ]]; then
    log "DRY_RUN $payload"
    return 0
  fi
  if [[ -z "${AMBIENT_JWT:-}" ]]; then
    log "WARN: AMBIENT_JWT unset — local pulse only"
    return 0
  fi
  curl -sS -X POST "${API_BASE%/}/api/v2/ambient/infer" \
    -H "Authorization: Bearer $AMBIENT_JWT" \
    -H "Content-Type: application/json" \
    -d "$payload" >/dev/null || log "WARN: infer failed"
}

log "starting ambient bridge interval=${INTERVAL_SEC}s"
while true; do
  pulse
  sleep "$INTERVAL_SEC"
done
