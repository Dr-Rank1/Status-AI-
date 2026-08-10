import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  spikesToSparse,
  associativeRecall,
  getOrganoidConfig,
} from '../src/services/organoid/organoidComputeService.js';
import {
  entangleNodes,
  syncEntangledMemory,
  measureEntangledState,
  resetEntanglementState,
  getEntanglementConfig,
} from '../src/services/quantum/entanglementSyncService.js';
import {
  scoreEnergySite,
  routeEnergyAwareWorkload,
  getEnergyRouterConfig,
} from '../src/services/devops/energyAwareWorkloadRouter.js';
import {
  analyzeBottlenecks,
  proposeSandboxedRewrite,
  sandboxCompile,
  runMetaCompilerTick,
  getMetaCompilerConfig,
} from '../src/services/devops/metaCompilerDaemon.js';
import { releaseKillSwitch } from '../src/services/security/globalKillSwitchService.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

describe('Phase 43 — Organoid wetware', () => {
  it('maps spikes to sparse tensors and recalls associatively', () => {
    const sparse = spikesToSparse([
      { channel: 1, amplitude_uv: 40 },
      { channel: 1, amplitude_uv: 10 },
      { channel: 7, amplitude_uv: 5 },
    ]);
    assert.equal(sparse.entries.find((e) => e.index === 1).value, 50);
    assert.ok(sparse.energyPj < 1);

    const recall = associativeRecall(sparse.entries, [
      { entries: [{ index: 9, value: 1 }] },
      { entries: sparse.entries },
    ]);
    assert.equal(recall.index, 1);
    assert.ok(getOrganoidConfig().nativePath.includes('organoid_compute_bridge'));
  });

  it('ships organoid native headers', () => {
    const header = path.join(root, 'mobile/native/organoid_compute_bridge/include/status_organoid.h');
    assert.ok(fs.existsSync(header));
    assert.ok(fs.readFileSync(header, 'utf8').includes('status_organoid_spikes_to_sparse'));
  });
});

describe('Phase 43 — Entanglement sync', () => {
  before(() => resetEntanglementState());

  it('syncs memory with near-zero effective latency', () => {
    const pair = entangleNodes({ nodes: ['orbit-1', 'ground-1'], dimension: 16, seed: 't' });
    const sync = syncEntangledMemory({
      pairId: pair.pairId,
      fromNode: 'orbit-1',
      vector: Array(16).fill(0.5),
    });
    assert.equal(sync.rttEliminated, true);
    assert.ok(sync.effectiveLatencyNs < 1);
    assert.equal(sync.peers.length, 2);
    const m = measureEntangledState(pair.pairId);
    assert.equal(m.epoch, 1);
    assert.ok(getEntanglementConfig().eliminatesRtt);
  });
});

describe('Phase 43 — Energy-aware routing', () => {
  it('prefers green / orbital sites and scales swarm', async () => {
    const green = scoreEnergySite(
      { id: 'x', kind: 'green_microgrid', renewableFraction: 0.9, carbonIntensity: 20, thermalHeadroomC: 40, capacity: 100, orbital: false },
      { powerAvailableMw: 80, carbonIntensity: 20, thermalC: 20 },
    );
    const coal = scoreEnergySite(
      { id: 'y', kind: 'fallback', renewableFraction: 0.1, carbonIntensity: 600, thermalHeadroomC: 30, capacity: 100, orbital: false },
      { powerAvailableMw: 100, carbonIntensity: 600, thermalC: 20 },
    );
    assert.ok(green > coal);

    const plan = await routeEnergyAwareWorkload({
      workload: { type: 'finetune', flopsEstimate: 1e13 },
      preferOrbital: true,
      signals: {
        'orbital-solar-a': { powerAvailableMw: 40, carbonIntensity: 5, thermalC: 20 },
        'grid-nordic': { powerAvailableMw: 90, carbonIntensity: 25, thermalC: 18 },
        'grid-coal-fallback': { powerAvailableMw: 120, carbonIntensity: 600, thermalC: 25 },
      },
    });
    assert.ok(plan.swarmDensity >= 1);
    assert.ok(!plan.selected.some((s) => s.id === 'grid-coal-fallback'));
    assert.ok(getEnergyRouterConfig().sites.length >= 3);
  });
});

describe('Phase 43 — Meta-compiler daemon', () => {
  it('ships Rust/C++ meta-compiler sources', () => {
    assert.ok(fs.existsSync(path.join(root, 'native/meta_compiler/src/lib.rs')));
    assert.ok(fs.existsSync(path.join(root, 'native/meta_compiler/include/status_meta_compiler.h')));
  });

  it('proposes sandboxed artifacts and denies hot-swap / sensitive paths', async () => {
    await releaseKillSwitch({ by: 'test' });
    const [hot] = analyzeBottlenecks({ path: 'backend/src/services/context/ContextEngine.js', cpu_pct: 90, p99_ms: 100 });
    assert.equal(hot.rewriteSuggested, true);

    const proposal = await proposeSandboxedRewrite(hot);
    assert.equal(proposal.sandboxed, true);
    assert.equal(proposal.hotSwapAllowed, false);
    const compiled = await sandboxCompile(proposal);
    assert.equal(compiled.applied, false);
    assert.ok(fs.existsSync(compiled.artifactPath));

    await assert.rejects(
      () => proposeSandboxedRewrite({
        hotspotPath: 'backend/src/services/security/globalKillSwitchService.js',
        cpuPct: 99,
        p99Ms: 200,
        rewriteSuggested: true,
      }),
      /deny|403|META_ALIGNMENT/i,
    );

    const tick = await runMetaCompilerTick({ cpu_pct: 10, p99_ms: 10 });
    assert.ok(tick.actions.some((a) => a.status === 'skip_healthy'));
    assert.equal(getMetaCompilerConfig().zeroTrust, true);
  });
});
