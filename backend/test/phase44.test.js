import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  predictRegionalSpikes,
  tuneGlobalBandwidth,
  getGlobalBrainSnapshot,
  resetGlobalBandwidth,
  getGlobalBrainConfig,
} from '../src/services/sentience/globalBrainService.js';
import {
  openChronoBranch,
  appendChronoEvent,
  detectChronoConflicts,
  resolveChronoConflicts,
  syncChronoBranchToGlobal,
  resetChronoBranches,
  getChronoConfig,
} from '../src/services/context/chronoParadoxResolver.js';
import {
  solarIrradianceFactor,
  scoreDysonSite,
  routeDysonianWorkload,
  DYSON_SEGMENTS,
  getDysonOrchestrationConfig,
} from '../src/services/devops/dysonEnergyOrchestrator.js';
import {
  rotateGenesisKey,
  getGenesisKeyStatus,
} from '../src/services/security/genesisKeyService.js';
import { releaseKillSwitch } from '../src/services/security/globalKillSwitchService.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

describe('Phase 44 — Global Brain', () => {
  before(() => resetGlobalBandwidth());

  it('predicts spikes and retunes regional bandwidth', async () => {
    const predictions = predictRegionalSpikes({
      signals: {
        maritime: { anomalyScore: 0.5, trafficGrowth: 0.1 },
        'na-east': { trafficGrowth: 0.25 },
      },
    });
    assert.ok(predictions.length >= 1);
    const tuning = tuneGlobalBandwidth({ predictions });
    assert.equal(tuning.tuned, true);
    assert.ok(tuning.allocations.maritime > 0);

    const snap = await getGlobalBrainSnapshot({
      signals: { orbital: { anomalyScore: 0.4 } },
      autoTune: true,
    });
    assert.equal(snap.entity, 'planetary-global-brain/v1');
    assert.ok(snap.sentience);
    assert.ok(getGlobalBrainConfig().regions.includes('orbital'));
  });
});

describe('Phase 44 — Chrono paradox resolution', () => {
  before(() => resetChronoBranches());

  it('detects concurrent conflicts and merges branches', async () => {
    const branch = openChronoBranch({ nodeId: 'probe-1', environment: 'deep-sea' });
    const remote = appendChronoEvent(branch.branchId, {
      content: 'contact anomaly at trench-7',
      validFrom: '2026-01-02T00:00:00.000Z',
      importance: 0.6,
      characterId: 'c1',
    });
    const local = {
      id: 'local-1',
      content: 'contact anomaly at trench-7',
      validFrom: '2026-01-01T00:00:00.000Z',
      importance: 0.5,
      characterId: 'c1',
      vectorClock: { 'probe-1': 0, hub: 2 },
    };
    // Force concurrent clocks
    remote.vectorClock = { 'probe-1': 3, hub: 1 };

    const conflicts = detectChronoConflicts([local], [remote]);
    assert.ok(conflicts.length >= 1);
    const resolutions = resolveChronoConflicts(conflicts);
    assert.ok(resolutions[0].strategy === 'merge_branch' || resolutions[0].strategy.startsWith('lww'));

    const sync = await syncChronoBranchToGlobal({
      branchId: branch.branchId,
      globalMemories: [local],
      persist: false,
    });
    assert.equal(sync.engine, 'chrono-paradox/v1');
    assert.ok(getChronoConfig().strategies.includes('merge_branch'));
  });
});

describe('Phase 44 — Dysonian energy', () => {
  it('gates pretrain to Dyson segments at high irradiance', async () => {
    assert.ok(solarIrradianceFactor({ observedWm2: 1300 }) > 0.9);
    const score = scoreDysonSite(DYSON_SEGMENTS[0], { irradiance: 0.95, powerAvailableMw: 4000 });
    assert.ok(score > 50);

    const plan = await routeDysonianWorkload({
      workload: { type: 'pretrain', flopsEstimate: 1e18 },
      irradianceWm2: 1300,
      forceOrbitalPretrain: true,
    });
    assert.equal(plan.mode, 'dysonian_orbital');
    assert.equal(plan.irradianceGate, true);
    assert.ok(plan.selected.every((s) => s.kind.startsWith('dyson')));
    assert.ok(fs.existsSync(path.join(root, 'infra/dyson/orbital_pretrain.tf')));
    assert.ok(fs.existsSync(path.join(root, 'infra/dyson/Pulumi.yaml')));
    assert.ok(getDysonOrchestrationConfig().iaC.length >= 2);
  });
});

describe('Phase 44 — Genesis Key & V4', () => {
  it('ships V4 substrate doc and rotates Genesis Key in dry-run', async () => {
    assert.ok(fs.existsSync(path.join(root, 'docs/V4_UNIVERSAL_SUBSTRATE.md')));
    assert.ok(fs.existsSync(path.join(root, 'dashboard/app/global-brain/page.tsx')));
    await releaseKillSwitch({ by: 'test' });
    const record = await rotateGenesisKey({ rotatedBy: 'test' });
    assert.equal(record.dryRun, true);
    assert.equal(record.killSwitchPreserved, true);
    assert.equal(record.rootCredentialsTransferred, false);
    assert.ok(record.publicCommitment.length === 64);
    assert.equal(getGenesisKeyStatus().humanInTheLoop, true);
  });
});
