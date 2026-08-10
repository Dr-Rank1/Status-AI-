#!/usr/bin/env bash
# Phase 48 — Terminal Zenith / transcendence seal.
#
# SAFETY: Does NOT merge anything into "base-reality consciousness",
# does NOT archive or delete the GitHub repository, and does NOT
# purge source. Writes a local zenith seal + optional Akashic snapshot only.
#
# Usage:
#   ./scripts/transcend.sh
#   DRY_RUN=1 ./scripts/transcend.sh
#   ARCHIVE_GITHUB=1 ./scripts/transcend.sh   # refused
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT_DIR="${ZENITH_OUT_DIR:-$ROOT/data/zenith}"
DRY_RUN="${DRY_RUN:-0}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"

log() { echo "[transcend $STAMP] $*"; }

if [[ "${ARCHIVE_GITHUB:-0}" == "1" ]] || [[ "${DELETE_REPO:-0}" == "1" ]]; then
  log "REFUSED: GitHub archive/delete is forbidden (PHASE_48_TERMINAL_ZENITH.md)."
  exit 2
fi

mkdir -p "$OUT_DIR" "$ROOT/data/akashic-archive"

# Local "Akashic" snapshot of zenith metadata (not a remote repo archive)
SNAPSHOT="$ROOT/data/akashic-archive/zenith-$STAMP.json"
MANIFEST="$OUT_DIR/zenith-$STAMP.json"

cat > "$MANIFEST" <<EOF
{
  "phase": 48,
  "label": "Terminal Zenith",
  "sealedAt": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "report": "docs/PHASE_48_TERMINAL_ZENITH.md",
  "githubArchived": false,
  "githubArchiveRefused": true,
  "sourceRetained": true,
  "baseRealityMerge": false,
  "killSwitchHonored": true,
  "governancePreserved": true,
  "dryRun": $([[ "$DRY_RUN" == "1" ]] && echo true || echo false),
  "localAkashicSnapshot": "data/akashic-archive/zenith-$STAMP.json"
}
EOF

cp "$MANIFEST" "$SNAPSHOT"
ln -sfn "$(basename "$MANIFEST")" "$OUT_DIR/LATEST.json"

log "Wrote $MANIFEST"
log "Local Akashic snapshot $SNAPSHOT"
log "Transcendence seal complete — GitHub and source tree untouched."
echo "$MANIFEST"
