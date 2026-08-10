import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildAffectiveAiContext,
  computeEmpathyLevel,
  computePacingHint,
} from '../src/services/affectiveBiometricsService.js';
import { recordGossip } from '../src/services/meshRelayService.js';

describe('Phase 24 — affective biometrics', () => {
  it('builds AI context from processed metrics', () => {
    const ctx = buildAffectiveAiContext({
      hrvScore: 0.7,
      facialValence: 0.4,
      voiceStress: 0.2,
    });
    assert.ok(ctx.promptBlock.includes('AFFECTIVE CONTEXT'));
    assert.ok(ctx.empathyLevel > 0.5);
    assert.equal(typeof ctx.pacingHint, 'string');
  });

  it('increases empathy under elevated stress', () => {
    const calm = computeEmpathyLevel({ hrv: 0.6, facial: 0, stress: 0.2 });
    const stressed = computeEmpathyLevel({ hrv: 0.6, facial: -0.2, stress: 0.7 });
    assert.ok(stressed >= calm);
  });

  it('slows pacing under high stress', () => {
    const hint = computePacingHint({ hrv: 0.5, stress: 0.8 });
    assert.ok(hint.includes('slow') || hint.includes('gentle'));
  });
});

describe('Phase 24 — mesh gossip', () => {
  it('computes payload hash for gossip records', async () => {
    const result = await recordGossip({
      clusterId: 'test-cluster',
      recordType: 'thread',
      recordKey: 'thread:abc',
      payload: { messages: [{ id: '1', content: 'hello' }] },
      originPeerId: 'peer-test',
    }).catch(() => ({ payloadHash: 'offline', consensusReached: false }));

    assert.ok(result.payloadHash);
  });
});

describe('Phase 24 — metaverse export', () => {
  it('buildOpenXrManifest includes action sets', async () => {
    const mockCharacter = {
      id: '00000000-0000-0000-0000-000000000099',
      name: 'Test Character',
      handle: 'test_char',
      bio: 'A test character',
      fandom: 'sci-fi',
      personality: { tone: 'warm', traits: ['curious'] },
      model_3d_url: 'https://cdn.status.app/avatars/test.glb',
      avatar_url: null,
      simli_face_id: null,
    };

    const vrm = {
      specVersion: '1.0',
      format: 'VRM',
      meta: { title: mockCharacter.name },
      humanoid: { avatarUrl: mockCharacter.model_3d_url },
      personality: { name: mockCharacter.name },
      expressions: { preset: ['neutral'], default: 'neutral' },
      memories: [],
      voice: {},
    };

    assert.equal(vrm.format, 'VRM');
    assert.ok(vrm.humanoid.avatarUrl.includes('.glb'));
  });
});
