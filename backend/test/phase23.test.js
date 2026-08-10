import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { fingerprintError, buildTestCasesForPatch } from '../src/services/selfHealing/selfHealingPatchEngine.js';
import { evaluatePatchInSandbox } from '../src/services/selfHealing/selfHealingSandbox.js';
import { getPatchForRoute, registerFallbackPatch } from '../src/services/selfHealing/selfHealingRegistry.js';
import { createPersona, generatePersonaBatch } from '../src/services/syntheticPersonaFactory.js';
import { mapBciToTheme, computeAffinityDelta } from '../src/services/bciIntentService.js';

describe('Phase 23 — self-healing', () => {
  it('fingerprints runtime errors consistently', () => {
    const err = { name: 'TypeError', message: 'Cannot read property x' };
    const req = { originalUrl: '/api/v1/posts?page=1', path: '/posts' };
    const a = fingerprintError(err, req);
    const b = fingerprintError(err, req);
    assert.equal(a, b);
    assert.equal(a.length, 16);
  });

  it('evaluates fallback patch in sandbox', async () => {
    const patch = {
      patchType: 'fallback_response',
      patchConfig: { status: 200, body: { data: [] } },
    };
    const sandbox = await evaluatePatchInSandbox(patch, buildTestCasesForPatch(patch));
    assert.equal(sandbox.passed, true);
    assert.ok(sandbox.passRate >= 0.8);
  });

  it('registers hot-fix fallback routes', () => {
    registerFallbackPatch({
      id: 'test-patch-1',
      routePattern: '/api/v1/posts',
      patchType: 'fallback_response',
      patchConfig: { status: 200, body: { data: [], meta: { degraded: true } } },
    });
    const patch = getPatchForRoute('/api/v1/posts');
    assert.ok(patch);
    assert.equal(patch.id, 'test-patch-1');
  });
});

describe('Phase 23 — synthetic personas', () => {
  it('generates distinct persona batches', () => {
    const batch = generatePersonaBatch(10);
    assert.equal(batch.length, 10);
    const keys = new Set(batch.map((p) => p.personaKey));
    assert.equal(keys.size, 10);
    assert.ok(batch[0].traits.axes.curiosity >= 0);
  });

  it('builds persona with stable keys', () => {
    const p = createPersona(0);
    assert.match(p.personaKey, /^sim-persona-/);
    assert.ok(p.displayName.length > 0);
  });
});

describe('Phase 23 — BCI intent', () => {
  it('maps valence/arousal to theme hints', () => {
    const theme = mapBciToTheme({ valence: 0.8, arousal: 0.6 });
    assert.ok(theme.backgroundColor.startsWith('#'));
    assert.equal(theme.moodLabel, 'positive');
    assert.equal(theme.energyLevel, 'medium');
  });

  it('computes affinity delta from neural signals', () => {
    const delta = computeAffinityDelta({
      valence: 0.5,
      arousal: 0.8,
      intentType: 'focus_character',
    });
    assert.ok(delta > 0);
    assert.ok(delta <= 10);
  });
});
