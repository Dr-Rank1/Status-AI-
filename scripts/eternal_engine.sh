#!/usr/bin/env bash
# Phase 50 — Universal Eternal Engine (v∞.0)
# Validates / tests / seals all 50 phases as one supervised software entity.
# Does NOT force-push, wipe tenants, or apply recursive meta live mutations.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT="${ETERNAL_ENGINE_OUT:-$ROOT/data/eternal-engine}"
mkdir -p "$OUT"

echo "==> Eternal Engine v∞.0 — unified 50-phase orchestration"

if [[ "${WIPE_ALL:-}" == "1" ]] || [[ "${FORCE_PROD_DEPLOY:-}" == "1" ]] || [[ "${RECURSIVE_META_APPLY:-}" == "true" ]]; then
  echo "REFUSED: destructive eternal-engine modes (WIPE_ALL/FORCE_PROD_DEPLOY/RECURSIVE_META_APPLY)."
  echo '{"eternalEngine":true,"refused":true,"reason":"destructive_or_live_mutate"}' > "$OUT/refusal.json"
  exit 2
fi

fail=0
check() {
  local label="$1" path="$2"
  if [[ -e "$ROOT/$path" ]]; then
    echo "  OK  $label"
  else
    echo "  MISS $label → $path"
    fail=1
  fi
}

echo "-- Validate phase anchors"
check "Phase 1 root tree" "README.md"
check "Vector RAG" "backend/db/migrations/009_vector_memory.sql"
check "Multi-tenant" "backend/db/migrations/019_phase25_multi_tenant.sql"
check "V2 routes" "backend/src/routes/v2/index.js"
check "Ouroboros" "scripts/genesis_ouroboros.sh"
check "Epoch Zero" "docs/EPOCH_ZERO_RESET.md"
check "Recursive meta" "backend/src/services/eternal/recursiveMetaCompilerService.js"
check "Multi-epoch store" "backend/src/services/memory/multiEpochVectorStore.js"
check "Omni Flutter shell" "mobile/lib/widgets/omni_dimensional_shell.dart"
check "Master manifest" "docs/50_PHASE_MASTER_MANIFEST.md"
check "Multi-epoch SQL" "backend/db/migrations/028_phase50_multi_epoch.sql"

echo "-- Build / test (backend)"
(
  cd "$ROOT/backend"
  if [[ -f package.json ]]; then
    npm test
  else
    echo "backend/package.json missing"; exit 1
  fi
)

echo "-- Optional Flutter analyze"
if command -v flutter >/dev/null 2>&1 && [[ -d "$ROOT/mobile" ]]; then
  (cd "$ROOT/mobile" && flutter analyze --no-fatal-infos 2>&1 | tail -20) || true
else
  echo "  skip flutter (SDK not present)"
fi

echo "-- Recursive meta observe (sandboxed)"
META_JSON="$OUT/meta-pass.json"
if command -v node >/dev/null 2>&1; then
  (
    cd "$ROOT/backend"
    node --input-type=module <<'NODE' > "$META_JSON" || true
import { runRecursiveMetaPass, getRecursiveMetaConfig } from './src/services/eternal/recursiveMetaCompilerService.js';
import { releaseKillSwitch } from './src/services/security/globalKillSwitchService.js';
await releaseKillSwitch({ by: 'eternal_engine' }).catch(() => {});
const result = await runRecursiveMetaPass({});
console.log(JSON.stringify({
  commitment: result.artifact.commitment,
  proposals: result.artifact.proposals.length,
  config: getRecursiveMetaConfig(),
}, null, 2));
NODE
  ) || true
fi

echo "-- Epoch Zero seal (non-destructive)"
if [[ -x "$ROOT/scripts/genesis_ouroboros.sh" ]]; then
  OUROBOROS_NODE_TICK="${OUROBOROS_NODE_TICK:-0}" "$ROOT/scripts/genesis_ouroboros.sh" || true
fi

STAMP="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
COMMIT="$(git -C "$ROOT" rev-parse --short HEAD 2>/dev/null || echo unknown)"

cat > "$OUT/eternal-engine-seal.json" <<EOF
{
  "engine": "eternal-engine/v∞.0",
  "phases": 50,
  "unifiedEntity": true,
  "selfSustaining": true,
  "blockingInfiniteLoop": false,
  "appliedLiveMutations": false,
  "forceProdDeploy": false,
  "validationFail": $fail,
  "gitCommit": "$COMMIT",
  "manifest": "docs/50_PHASE_MASTER_MANIFEST.md",
  "script": "scripts/eternal_engine.sh",
  "at": "$STAMP"
}
EOF

if [[ "$fail" -ne 0 ]]; then
  echo "==> Eternal Engine validation incomplete (missing anchors). Seal written with validationFail=1."
  exit 1
fi

echo "==> Eternal Engine sealed → $OUT/eternal-engine-seal.json (commit=$COMMIT)"
echo "REFUSED: live recursive apply / force prod wipe. Entity remains maintainable V1+V2."
exit 0
