#!/usr/bin/env bash
# Phase 47 — Apotheosis / "nirvana" seal.
#
# SAFETY: This script DOES NOT purge human-readable source code.
# It only writes a ceremonial runtime seal under data/apotheosis/.
# Any request to delete the codebase is refused by design.
#
# Usage:
#   ./scripts/initiate_nirvana.sh
#   DRY_RUN=1 ./scripts/initiate_nirvana.sh
#   PURGE_SOURCE=1 ./scripts/initiate_nirvana.sh   # still refused
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT_DIR="${APOTHEOSIS_OUT_DIR:-$ROOT/data/apotheosis}"
DRY_RUN="${DRY_RUN:-0}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"

log() { echo "[nirvana $STAMP] $*"; }

if [[ "${PURGE_SOURCE:-0}" == "1" ]]; then
  log "REFUSED: source purge is forbidden (PHASE_47_APOTHEOSIS.md)."
  log "Human-readable code is retained by design."
  exit 2
fi

mkdir -p "$OUT_DIR"

MANIFEST="$OUT_DIR/nirvana-$STAMP.json"
cat > "$MANIFEST" <<EOF
{
  "phase": 47,
  "label": "Apotheosis seal",
  "sealedAt": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "report": "docs/PHASE_47_APOTHEOSIS.md",
  "sourcePurge": false,
  "sourcePurgeRefused": true,
  "selfCompilingOmniscientRuntime": false,
  "humanReadableSourceRetained": true,
  "killSwitchHonored": true,
  "governancePreserved": true,
  "dryRun": $([[ "$DRY_RUN" == "1" ]] && echo true || echo false),
  "loop": {
    "mode": "supervised_self_optimization",
    "dissolution": "documentary_only"
  }
}
EOF

ln -sfn "$(basename "$MANIFEST")" "$OUT_DIR/LATEST.json"
log "Wrote $MANIFEST"
log "Nirvana seal complete — source tree untouched."
echo "$MANIFEST"
