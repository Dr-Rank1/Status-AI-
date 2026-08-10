#!/usr/bin/env bash
# Phase 40 — Golden Master 2.0 architectural freeze + autopilot lock.
#
# Compiles a freeze manifest, runs backend tests, and records deployment lock.
# Does NOT force-push, skip hooks, or open production PRs.
#
# Usage:
#   ./scripts/golden_master_2_freeze.sh
#   DRY_RUN=1 ./scripts/golden_master_2_freeze.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT_DIR="${FREEZE_OUT_DIR:-$ROOT/data/golden-master-2}"
DRY_RUN="${DRY_RUN:-0}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"

log() { echo "[gm2-freeze $STAMP] $*"; }

mkdir -p "$OUT_DIR"

log "Running backend test gate…"
if [[ "$DRY_RUN" == "1" ]]; then
  log "DRY_RUN: skip npm test"
else
  (cd "$ROOT/backend" && npm test)
fi

MANIFEST="$OUT_DIR/freeze-$STAMP.json"
cat > "$MANIFEST" <<EOF
{
  "version": "2.0.0",
  "label": "Golden Master 2.0",
  "frozenAt": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "v1Api": "/api/v1",
  "v2Api": "/api/v2",
  "v3Blueprint": "docs/V3_GENESIS_ARCHITECTURE.md",
  "autopilot": {
    "mode": "continuous",
    "codeSynthesisDefault": "dry-run",
    "killSwitchHonored": true,
    "humanReviewRequired": true
  },
  "locks": [
    "no_force_push_main",
    "no_skip_hooks",
    "v1_backward_compatible",
    "rls_tenant_isolation"
  ]
}
EOF

ln -sfn "$(basename "$MANIFEST")" "$OUT_DIR/LATEST.json"
log "Wrote $MANIFEST"
log "Autopilot lock recorded — V3 genesis blueprint remains docs-only until explicitly unlocked."
echo "$MANIFEST"
