import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  spawnUniverse,
  tuneUniversePhysics,
  tickUniverseEntropy,
  getArchitectTelemetry,
  resetExNihiloState,
  getExNihiloConfig,
} from '../src/services/genesis/exNihiloGenesisEngine.js';
import {
  compileRealityBlueprint,
  simulateAmbientNodeScale,
  resetRealityRecipes,
  getRealityCompilerConfig,
} from '../src/services/reality/realityCompilerService.js';
import { getArchitectCanvasSnapshot } from '../src/services/ops/architectCanvasService.js';
import { releaseKillSwitch } from '../src/services/security/globalKillSwitchService.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

describe('Phase 48 — Ex-nihilo genesis', () => {
  before(() => resetExNihiloState());

  it('spawns universes and tunes physics in sandbox', async () => {
    await releaseKillSwitch({ by: 'test' });
    const u = spawnUniverse({
      name: 'sandbox-alpha',
      dimensions: 4,
      physics: { c: 2.5e8, thermodynamicEfficiency: 0.8 },
    });
    assert.equal(u.sandbox, true);
    assert.ok(u.rules.c <= 1e9);
    const tuned = tuneUniversePhysics(u.id, { G: 7e-11 });
    assert.ok(tuned.rules.G > 0);
    const ent = tickUniverseEntropy(u.id, { dt: 100 });
    assert.ok(ent.entropy >= u.rules.entropyFloor);
    assert.ok(getArchitectTelemetry().universes >= 1);
    assert.equal(getExNihiloConfig().sandboxOnly, true);
  });
});

describe('Phase 48 — Reality compiler', () => {
  before(() => resetRealityRecipes());

  it('compiles blueprints and denies physical fabrication', async () => {
    await releaseKillSwitch({ by: 'test' });
    const recipe = await compileRealityBlueprint({
      definition: { shape: 'lattice', nodes: 4 },
      purpose: 'compute_node',
    });
    assert.equal(recipe.blueprintOnly, true);
    assert.equal(recipe.physicalNodeRendered, false);
    const scale = simulateAmbientNodeScale({ recipeId: recipe.recipeId, nodes: 8 });
    assert.equal(scale.physicalNodeRendered, false);
    assert.ok(fs.existsSync(path.join(root, 'mobile/native/reality_compiler_bridge/include/status_reality.h')));
    assert.equal(getRealityCompilerConfig().blueprintOnly, true);
  });
});

describe('Phase 48 — Architect Canvas & Zenith', () => {
  it('aggregates canvas telemetry and ships transcend script that refuses GitHub archive', async () => {
    const snap = await getArchitectCanvasSnapshot();
    assert.equal(snap.canvas, 'architect/v1');
    assert.ok('universeCount' in snap.multiversal);
    assert.ok(fs.existsSync(path.join(root, 'docs/PHASE_48_TERMINAL_ZENITH.md')));
    assert.ok(fs.existsSync(path.join(root, 'dashboard/app/architect-canvas/page.tsx')));
    const script = fs.readFileSync(path.join(root, 'scripts/transcend.sh'), 'utf8');
    assert.ok(script.includes('REFUSED'));
    assert.ok(script.includes('githubArchived'));
  });
});
