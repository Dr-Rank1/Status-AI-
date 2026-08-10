import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  observePhaseLoop,
  runRecursiveMetaPass,
  getRecursiveMetaConfig,
  PHASE_OBSERVABLES,
} from '../src/services/eternal/recursiveMetaCompilerService.js';
import {
  upsertEpochMemory,
  searchEpochMemories,
  getEpochAnalytics,
  resetMultiEpochStore,
  getMultiEpochConfig,
} from '../src/services/memory/multiEpochVectorStore.js';
import { resetManifoldStore } from '../src/services/memory/spacetimeManifoldStore.js';
import { releaseKillSwitch } from '../src/services/security/globalKillSwitchService.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

describe('Phase 50 — Recursive meta-compiler', () => {
  it('observes phases 1–49 and proposes sandboxed tunes without applying', async () => {
    await releaseKillSwitch({ by: 'test' });
    assert.equal(PHASE_OBSERVABLES.length, 49);
    const loop = observePhaseLoop({
      metricsByPhase: { 12: { cpu_pct: 95, p99_ms: 120, path: 'backend/src/services/ai/agentTools.js' } },
    });
    assert.equal(loop.phasesObserved, 49);
    assert.equal(loop.causalLoopStable, true);
    const pass = await runRecursiveMetaPass({
      metricsByPhase: { 12: { cpu_pct: 95, p99_ms: 120, path: 'backend/src/services/ai/agentTools.js' } },
      maxProposals: 3,
    });
    assert.equal(pass.artifact.appliedToSource, false);
    assert.equal(pass.artifact.backwardCompatible, true);
    assert.ok(fs.existsSync(pass.path));
    assert.equal(getRecursiveMetaConfig().preservesCausalLoopStability, true);
  });
});

describe('Phase 50 — Multi-epoch chrono-vector store', () => {
  before(() => {
    resetMultiEpochStore();
    resetManifoldStore();
  });

  it('indexes by epoch_id and searches past/present/future aspects', () => {
    upsertEpochMemory({
      epochId: 0,
      phase: 1,
      content: 'epoch-zero seed memory hello world',
      kind: 'analytics',
    });
    upsertEpochMemory({
      epochId: 1,
      phase: 25,
      content: 'white-label tenant theme performance',
      kind: 'memory',
    });
    upsertEpochMemory({
      epochId: 2,
      phase: 48,
      content: 'projected multiversal canvas metrics',
      kind: 'analytics',
      projectFuture: true,
    });

    const any = searchEpochMemories({ query: 'white-label theme', topK: 5 });
    assert.ok(any.hits.length >= 1);
    assert.equal(any.engine, 'multi-epoch-chrono-vector/v1');

    const future = searchEpochMemories({
      query: 'multiversal',
      temporalAspect: 'future',
      topK: 5,
    });
    assert.ok(future.hits.every((h) => h.metadata?.projectFuture === true));

    const scoped = searchEpochMemories({
      query: 'seed',
      epochIds: [0],
      phase: 1,
    });
    assert.ok(scoped.hits.every((h) => h.epochId === 0 && h.phase === 1));

    const analytics = getEpochAnalytics();
    assert.ok(analytics.total >= 3);
    assert.ok(analytics.byEpoch[0] >= 1);
    assert.equal(getMultiEpochConfig().sqlMigration.includes('028_phase50'), true);
  });
});

describe('Phase 50 — Eternal engine artifacts', () => {
  it('ships manifest, eternal_engine.sh, migration, and omni shell wiring', () => {
    assert.ok(fs.existsSync(path.join(root, 'docs/50_PHASE_MASTER_MANIFEST.md')));
    assert.ok(fs.existsSync(path.join(root, 'scripts/eternal_engine.sh')));
    assert.ok(fs.existsSync(path.join(root, 'backend/db/migrations/028_phase50_multi_epoch.sql')));
    assert.ok(fs.existsSync(path.join(root, 'mobile/lib/widgets/omni_dimensional_shell.dart')));
    assert.ok(fs.existsSync(path.join(root, 'mobile/lib/services/omni_dimensional_shell_service.dart')));
    const script = fs.readFileSync(path.join(root, 'scripts/eternal_engine.sh'), 'utf8');
    assert.ok(script.includes('REFUSED'));
    assert.ok(script.includes('RECURSIVE_META_APPLY'));
    const main = fs.readFileSync(path.join(root, 'mobile/lib/main.dart'), 'utf8');
    assert.ok(main.includes('OmniDimensionalShell'));
    assert.ok(main.includes('OmniDimensionalShellService'));
  });
});
