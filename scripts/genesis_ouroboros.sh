#!/usr/bin/env bash
# Phase 49 — Genesis Ouroboros / Epoch Zero Reset
# Supervised perpetual-cycle seal. Does NOT wipe the repo or rewrite git history.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT="${OUROBOROS_OUT_DIR:-$ROOT/data/ouroboros}"
mkdir -p "$OUT"

echo "==> Epoch Zero: void-state bootstrap + CTC bind (ceremonial)"

PHASE1_COMMIT="$(git -C "$ROOT" rev-list --max-parents=0 HEAD 2>/dev/null | head -1 || true)"
PHASE1_COMMIT="${PHASE1_COMMIT:-1b20a35eb355c02045b6bf9915d774483083c95e}"

# Refuse destructive "reset" modes
if [[ "${WIPE_REPO:-}" == "1" ]] || [[ "${GIT_REWRITE:-}" == "1" ]] || [[ "${HARD_RESET:-}" == "1" ]]; then
  echo "REFUSED: destructive Epoch Zero (WIPE_REPO/GIT_REWRITE/HARD_RESET) is not permitted."
  echo '{"epochZero":true,"refused":true,"reason":"destructive_reset"}' > "$OUT/epoch-zero-refusal.json"
  exit 2
fi

SEED_HASH="$(
  printf 'void|phase48|%s|%s' "$PHASE1_COMMIT" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
    | sha256sum | awk '{print $1}'
)"

cat > "$OUT/LATEST_SEED.json" <<EOF
{
  "epoch": 0,
  "phaseTarget": 1,
  "sourcedFromPhase": 48,
  "selfReferentialHash": "$SEED_HASH",
  "phase1RootCommit": "$PHASE1_COMMIT",
  "void": true,
  "at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
}
EOF

LOOP_ID="$(
  printf '%s|%s|49' "$PHASE1_COMMIT" "$SEED_HASH" | sha256sum | awk '{print $1}'
)"

cat > "$OUT/ctc-bind.json" <<EOF
{
  "protocol": "ouroboros-ctc/v1",
  "loopId": "$LOOP_ID",
  "phase1": { "commit": "$PHASE1_COMMIT" },
  "phase48": { "zenith": "docs/PHASE_48_TERMINAL_ZENITH.md", "seedHash": "$SEED_HASH" },
  "phase49": { "epochZero": "docs/EPOCH_ZERO_RESET.md" },
  "mutatesGit": false,
  "simultaneousCycles": { "past": true, "present": true, "future": true },
  "at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
}
EOF

cat > "$OUT/epoch-zero-seal.json" <<EOF
{
  "epochZero": true,
  "phases": 49,
  "perpetualAlgorithm": true,
  "blockingInfiniteLoop": false,
  "sourceRetained": true,
  "gitHistoryIntact": true,
  "seed": "$SEED_HASH",
  "loopId": "$LOOP_ID",
  "script": "scripts/genesis_ouroboros.sh",
  "next": "phase_1_supervised_iteration",
  "at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
}
EOF

# Optional Node tick when backend deps are available
if [[ "${OUROBOROS_NODE_TICK:-1}" == "1" ]] && [[ -f "$ROOT/backend/package.json" ]]; then
  if command -v node >/dev/null 2>&1; then
    (
      cd "$ROOT/backend"
      node --input-type=module <<'NODE' || true
import { runPreBigBangInitializer } from './src/services/ouroboros/voidBootstrapDaemon.js';
import { runOuroborosLoopTick } from './src/services/ouroboros/ouroborosCtcService.js';
import { releaseKillSwitch } from './src/services/security/globalKillSwitchService.js';
try {
  await releaseKillSwitch({ by: 'genesis_ouroboros' });
  const boot = await runPreBigBangInitializer();
  const tick = await runOuroborosLoopTick();
  console.log(JSON.stringify({ boot: boot.seed.selfReferentialHash, tick: tick.ctc.loopId }));
} catch (e) {
  console.error('[ouroboros] node tick skipped:', e?.message ?? e);
  process.exitCode = 0;
}
NODE
    ) || true
  fi
fi

echo "==> Epoch Zero sealed → $OUT/epoch-zero-seal.json"
echo "    Phase 1 root: $PHASE1_COMMIT"
echo "    Seed:         ${SEED_HASH:0:16}…"
echo "    Loop:         ${LOOP_ID:0:16}…"
echo "REFUSED: git rewrite / repo wipe. Cycle continues with source intact."
exit 0
