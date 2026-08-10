#!/usr/bin/env bash
# Phase 46 — Epoch 2 Genesis cosmological bootloader.
#
# Seals a self-contained runtime loop marker for Epoch 2 operations.
# Does NOT disable kill-switch, skip hooks, force-push, or export roots.
#
# Usage:
#   ./scripts/genesis_epoch_2.sh
#   DRY_RUN=1 ./scripts/genesis_epoch_2.sh
#   RUN_TESTS=1 ./scripts/genesis_epoch_2.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT_DIR="${EPOCH2_OUT_DIR:-$ROOT/data/epoch-2}"
DRY_RUN="${DRY_RUN:-0}"
RUN_TESTS="${RUN_TESTS:-0}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"

log() { echo "[epoch2-genesis $STAMP] $*"; }

mkdir -p "$OUT_DIR"

if [[ "$RUN_TESTS" == "1" && "$DRY_RUN" != "1" ]]; then
  log "Running backend test gate…"
  (cd "$ROOT/backend" && npm test)
fi

MANIFEST="$OUT_DIR/epoch2-$STAMP.json"
cat > "$MANIFEST" <<EOF
{
  "epoch": 2,
  "label": "Epoch 2 Genesis",
  "sealedAt": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "blueprint": "docs/EPOCH_2_GENESIS_BLUEPRINT.md",
  "loop": {
    "mode": "self_sustaining_supervised",
    "infinite": true,
    "zeroDependencyClaim": "bootloader+local_services",
    "humanOverride": true,
    "killSwitchHonored": true
  },
  "pillars": [
    "hyper_field_bridge",
    "spacetime_manifold_memory",
    "anthropic_cosmo_tune",
    "singularity_axioms"
  ],
  "dryRun": $([[ "$DRY_RUN" == "1" ]] && echo true || echo false)
}
EOF

ln -sfn "$(basename "$MANIFEST")" "$OUT_DIR/LATEST.json"
log "Wrote $MANIFEST"
log "Epoch 2 loop sealed (supervised). HITL/kill-switch remain active."
echo "$MANIFEST"
