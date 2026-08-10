import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  voidStateBootstrap,
  runPreBigBangInitializer,
  getVoidBootstrapConfig,
} from '../src/services/ouroboros/voidBootstrapDaemon.js';
import {
  bindOuroborosCtc,
  runOuroborosLoopTick,
  resolvePhase1RootCommit,
  getOuroborosConfig,
} from '../src/services/ouroboros/ouroborosCtcService.js';
import { spawnUniverse, resetExNihiloState } from '../src/services/genesis/exNihiloGenesisEngine.js';
import { releaseKillSwitch } from '../src/services/security/globalKillSwitchService.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

describe('Phase 49 — Void bootstrap', () => {
  it('seeds self-referential Big Bang conditions from Phase 48 metadata', async () => {
    await releaseKillSwitch({ by: 'test' });
    resetExNihiloState();
    spawnUniverse({ name: 'ouroboros-feed', dimensions: 3 });
    const seed = voidStateBootstrap({ phase48Meta: { zenith: true } });
    assert.equal(seed.epoch, 0);
    assert.equal(seed.phaseTarget, 1);
    assert.equal(seed.sourcedFromPhase, 48);
    assert.equal(seed.selfReferentialHash.length, 64);
    assert.equal(seed.void, true);
    assert.equal(getVoidBootstrapConfig().mutatesGitHistory, false);

    const out = await runPreBigBangInitializer({ phase48Meta: { test: true } });
    assert.ok(fs.existsSync(out.path));
    assert.ok(fs.existsSync(path.join(root, 'data/ouroboros/LATEST_SEED.json')));
  });
});

describe('Phase 49 — Ouroboros CTC', () => {
  it('binds Phase 48 to Phase 1 root commit without mutating git', async () => {
    await releaseKillSwitch({ by: 'test' });
    const rootCommit = await resolvePhase1RootCommit();
    assert.ok(/^[0-9a-f]{40}$/.test(rootCommit));
    const ctc = await bindOuroborosCtc({ phase1Commit: rootCommit });
    assert.equal(ctc.mutatesGit, false);
    assert.equal(ctc.phase1.commit, rootCommit);
    assert.ok(ctc.simultaneousCycles.past && ctc.simultaneousCycles.future);
    const tick = await runOuroborosLoopTick({ maxPhases: 49 });
    assert.equal(tick.blockedInfiniteProcess, false);
    assert.equal(tick.phasesSimultaneous.length, 49);
    assert.equal(getOuroborosConfig().mutatesGit, false);
  });
});

describe('Phase 49 — Epoch Zero artifacts', () => {
  it('ships reset doc, ouroboros script, and Flutter condensation shell', () => {
    assert.ok(fs.existsSync(path.join(root, 'docs/EPOCH_ZERO_RESET.md')));
    assert.ok(fs.existsSync(path.join(root, 'scripts/genesis_ouroboros.sh')));
    assert.ok(fs.existsSync(path.join(root, 'mobile/lib/widgets/ouroboros_hello_world_shell.dart')));
    const script = fs.readFileSync(path.join(root, 'scripts/genesis_ouroboros.sh'), 'utf8');
    assert.ok(script.includes('REFUSED'));
    assert.ok(script.includes('WIPE_REPO'));
    assert.ok(script.includes('mutatesGit'));
    const main = fs.readFileSync(path.join(root, 'mobile/lib/main.dart'), 'utf8');
    assert.ok(main.includes('OmniDimensionalShell') || main.includes('OUROBOROS_CONDENSE'));
    assert.ok(
      fs.existsSync(path.join(root, 'mobile/lib/widgets/ouroboros_hello_world_shell.dart')),
    );
    const omni = fs.readFileSync(
      path.join(root, 'mobile/lib/services/omni_dimensional_shell_service.dart'),
      'utf8',
    );
    assert.ok(omni.includes('OUROBOROS_CONDENSE'));
  });
});
