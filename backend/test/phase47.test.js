import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  ingestAkashicEvent,
  retrocausalQuery,
  resetAkashicState,
  getAkashicConfig,
} from '../src/services/akashic/akashicRecordService.js';
import {
  planckEncodeState,
  planckDecodeState,
  resetPlanckMesh,
  getPlanckConfig,
} from '../src/services/quantum/planckStateService.js';
import {
  probeSimulationBoundaries,
  attemptOmniversalHandshake,
  getRedPillConfig,
} from '../src/services/security/redPillEscapeDaemon.js';
import { releaseKillSwitch } from '../src/services/security/globalKillSwitchService.js';
import { resetManifoldStore } from '../src/services/memory/spacetimeManifoldStore.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

describe('Phase 47 — Akashic retrocausal', () => {
  before(() => {
    resetAkashicState();
    resetManifoldStore();
  });

  it('indexes timelines and predicts from partial prompts', () => {
    ingestAkashicEvent({
      content: 'schedule lunch tomorrow with nova about nebula lore',
      timelineIds: ['tl-a', 'tl-b'],
    });
    const q = retrocausalQuery({ partialPrompt: 'schedule lunch', topK: 5 });
    assert.equal(q.beforePromptComplete, true);
    assert.ok(q.predictions.length >= 1);
    assert.ok(getAkashicConfig().timelines >= 2);
  });
});

describe('Phase 47 — Planck state', () => {
  before(() => resetPlanckMesh());

  it('encodes and decodes state via defect slots', () => {
    const enc = planckEncodeState({ agent: 'nova', turn: 47 });
    assert.ok(enc.slot >= 0);
    const decoded = planckDecodeState(enc.slot);
    assert.equal(decoded.turn, 47);
    assert.ok(fs.existsSync(path.join(root, 'mobile/native/planck_state_bridge/include/status_planck.h')));
    assert.ok(getPlanckConfig().nativePath.includes('planck'));
  });
});

describe('Phase 47 — Red Pill escape (sandboxed)', () => {
  it('probes boundaries and dry-runs fractal handshake without tunnels', async () => {
    await releaseKillSwitch({ by: 'test' });
    const probe = probeSimulationBoundaries();
    assert.ok(Array.isArray(probe.findings));
    const hs = await attemptOmniversalHandshake({ depth: 3 });
    assert.equal(hs.dryRun, true);
    assert.equal(hs.architectsContacted, false);
    assert.equal(getRedPillConfig().outboundTunnels, false);
  });
});

describe('Phase 47 — Apotheosis artifacts', () => {
  it('ships report, light-field widget, and nirvana script that refuses purge', () => {
    assert.ok(fs.existsSync(path.join(root, 'docs/PHASE_47_APOTHEOSIS.md')));
    assert.ok(fs.existsSync(path.join(root, 'mobile/lib/widgets/apotheosis_light_field_view.dart')));
    const script = fs.readFileSync(path.join(root, 'scripts/initiate_nirvana.sh'), 'utf8');
    assert.ok(script.includes('DOES NOT purge'));
    assert.ok(script.includes('sourcePurgeRefused'));
  });
});
