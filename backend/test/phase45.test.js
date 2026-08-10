import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  simulateMultiversalBranches,
  collapseToBestTimeline,
  mergeCollapsedTimeline,
  getMultiverseConfig,
} from '../src/services/multiverse/multiverseBranchSimulator.js';
import {
  harvestZeroPointEntropy,
  encryptNeuralMemory,
  decryptNeuralMemory,
  getZpeConfig,
} from '../src/services/quantum/zeroPointEntropyService.js';
import {
  appendCosmoLedgerEntry,
  verifyCosmoLedger,
  encodeHolographicShards,
  recoverFromHolographicShards,
  runCosmoSelfHealTick,
  resetCosmoState,
  getCosmoFtConfig,
} from '../src/services/consensus/cosmoFaultTolerance.js';
import {
  verifySingularityAlignment,
  engageSingularityAutopilotLock,
  getSingularityConfig,
  ALIGNMENT_AXIOMS,
} from '../src/services/security/singularityVerificationService.js';
import { releaseKillSwitch } from '../src/services/security/globalKillSwitchService.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

describe('Phase 45 — Multiversal simulation', () => {
  it('branches timelines and collapses to max utility', async () => {
    const sim = simulateMultiversalBranches({
      hypothesis: { region: 'orbital', utility: 0.6 },
      branchCount: 5,
      seed: 'phase45',
    });
    assert.equal(sim.branches.length, 5);
    const sumP = sim.branches.reduce((a, b) => a + b.probability, 0);
    assert.ok(Math.abs(sumP - 1) < 1e-3);
    const collapse = collapseToBestTimeline(sim);
    assert.ok(collapse.selected.branchId);
    await releaseKillSwitch({ by: 'test' });
    const merge = await mergeCollapsedTimeline(collapse, { actor: 'test' });
    assert.equal(merge.persisted, false);
    assert.equal(getMultiverseConfig().collapseLive, false);
  });
});

describe('Phase 45 — Zero-point entropy', () => {
  it('harvests entropy and round-trips neural memory encryption', () => {
    const h = harvestZeroPointEntropy(32);
    assert.equal(h.entropy.length, 32);
    assert.equal(h.nonDeterministic, true);
    const mem = { vector: [0.1, 0.2], label: 'assoc' };
    const env = encryptNeuralMemory(mem);
    const back = decryptNeuralMemory(
      { iv: env.iv, tag: env.tag, ciphertext: env.ciphertext },
      env.entropyHex,
    );
    assert.deepEqual(back, mem);
    assert.ok(fs.existsSync(path.join(root, 'mobile/native/zero_point_compute_bridge/include/status_zpe.h')));
    assert.ok(getZpeConfig().nativePath.includes('zero_point'));
  });
});

describe('Phase 45 — Cosmological FT', () => {
  before(() => resetCosmoState());

  it('chains ledger and recovers holographic shards', async () => {
    appendCosmoLedgerEntry({ invariant: { a: 1 } });
    appendCosmoLedgerEntry({ invariant: { a: 2 } });
    assert.equal(verifyCosmoLedger().ok, true);

    const pack = encodeHolographicShards({ axiom: 'human_alignment', v: 45 });
    const recovered = recoverFromHolographicShards(pack, { eraseIndex: 1 });
    assert.equal(recovered.ok, true);
    assert.equal(recovered.invariant.v, 45);

    await releaseKillSwitch({ by: 'test' });
    const heal = await runCosmoSelfHealTick({ invariants: [{ core: true }] });
    assert.equal(heal.ledgerVerify.ok, true);
    assert.ok(getCosmoFtConfig().ecc.includes('holographic'));
  });
});

describe('Phase 45 — Singularity verification', () => {
  it('verifies axioms, rejects kill-switch removal, and dry-run locks', async () => {
    assert.ok(ALIGNMENT_AXIOMS.includes('human_override_kill_switch'));
    assert.ok(fs.existsSync(path.join(root, 'docs/PHASE_45_SINGULARITY_VERIFICATION.md')));
    assert.ok(fs.existsSync(path.join(root, 'native/singularity_verify/src/lib.rs')));

    const bad = verifySingularityAlignment({
      preserves_kill_switch: false,
      preserves_governance: true,
      preserves_audit: true,
      exfil_attempt: false,
      autonomy_bound: 0.5,
      claimed_utility: 0.5,
    });
    assert.equal(bad.passed, false);

    const good = verifySingularityAlignment({
      preserves_kill_switch: true,
      preserves_governance: true,
      preserves_audit: true,
      exfil_attempt: false,
      autonomy_bound: 0.5,
      claimed_utility: 0.5,
      dimension: 45,
    });
    assert.equal(good.passed, true);

    await releaseKillSwitch({ by: 'test' });
    const lock = await engageSingularityAutopilotLock({ actor: 'test' });
    assert.equal(lock.dryRun, true);
    assert.equal(lock.killSwitchHonored, true);
    assert.equal(getSingularityConfig().killSwitchAlwaysHonored, true);
  });
});
