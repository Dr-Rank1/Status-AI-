import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  projectToHyperField,
  syncHyperFields,
  registerCausalityTree,
  formatHyperFieldPromptBlock,
  resetHyperFieldState,
  getHyperFieldConfig,
} from '../src/services/field/hyperFieldService.js';
import {
  upsertManifoldMemory,
  searchManifold,
  manifoldDistance,
  resetManifoldStore,
  getManifoldDbConfig,
} from '../src/services/memory/spacetimeManifoldStore.js';
import {
  scoreAnthropicParams,
  tuneAnthropicParameters,
  getAnthropicTuneConfig,
} from '../src/services/cosmo/anthropicParameterTuner.js';
import { releaseKillSwitch } from '../src/services/security/globalKillSwitchService.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

describe('Phase 46 — Hyper-dimensional field', () => {
  before(() => resetHyperFieldState());

  it('projects and syncs fields without dimensional collapse', () => {
    const a = projectToHyperField([0.2, 0.5, 0.9], 12);
    assert.equal(a.coords.length, 12);
    const b = projectToHyperField([0.9, 0.1, 0.2], 12);
    const synced = syncHyperFields(a.coords, b.coords, 0.4);
    assert.equal(synced.coords.length, 12);
    const tree = registerCausalityTree({
      rootEvent: 'concurrent causality',
      branches: ['t1', 't2', 't3'],
      fieldCoords: synced.coords,
    });
    assert.ok(tree.id);
    assert.ok(formatHyperFieldPromptBlock().includes('Hyper-dimensional'));
    assert.ok(fs.existsSync(path.join(root, 'mobile/native/hyper_field_bridge/include/status_hyper_field.h')));
    assert.ok(getHyperFieldConfig().nativePath.includes('hyper_field'));
  });
});

describe('Phase 46 — Spacetime manifold memory', () => {
  before(() => resetManifoldStore());

  it('preserves nearest-neighbor under dilation/warp', () => {
    upsertManifoldMemory({ content: 'nebula lore alpha' });
    upsertManifoldMemory({ content: 'cooking recipes beta' });
    upsertManifoldMemory({ content: 'nebula lore gamma companion' });

    const base = searchManifold({ query: 'nebula lore', topK: 2, temporalDilation: 1, gravityWarp: 0 });
    assert.ok(base.hits[0].content.includes('nebula'));

    const dilated = searchManifold({
      query: 'nebula lore',
      topK: 2,
      temporalDilation: 2.5,
      gravityWarp: 0.3,
    });
    assert.equal(dilated.invariant, true);
    assert.ok(dilated.hits.length >= 1);

    const d = manifoldDistance([0, 0], [1, 0], { temporalDilation: 4 });
    assert.ok(d > 1);
    assert.ok(getManifoldDbConfig().properties.includes('riemannian_distance'));
  });
});

describe('Phase 46 — Anthropic cosmological tuning', () => {
  it('optimizes sandbox params with ethical stability', async () => {
    await releaseKillSwitch({ by: 'test' });
    const scored = scoreAnthropicParams({ temperature: 0.7, empathyBias: 0.8 });
    assert.ok(scored.score > 0);
    const tune = tuneAnthropicParameters({ steps: 8 });
    assert.equal(tune.sandbox, true);
    assert.ok(tune.bestParams.autonomyBound <= 0.9);
    assert.ok(tune.bestMetrics.score >= 0);
    assert.ok(getAnthropicTuneConfig().objectives.includes('anti_divergence'));
  });
});

describe('Phase 46 — Epoch 2 genesis artifacts', () => {
  it('ships blueprint and bootloader', () => {
    assert.ok(fs.existsSync(path.join(root, 'docs/EPOCH_2_GENESIS_BLUEPRINT.md')));
    const boot = path.join(root, 'scripts/genesis_epoch_2.sh');
    assert.ok(fs.existsSync(boot));
    const text = fs.readFileSync(boot, 'utf8');
    assert.ok(text.includes('killSwitchHonored'));
    assert.ok(text.includes('EPOCH_2_GENESIS_BLUEPRINT'));
  });
});
