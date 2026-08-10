import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildAffectiveAiContext } from '../src/services/affectiveBiometricsService.js';

describe('Phase 25 — multi-tenant', () => {
  it('JWT payload includes tenantId when signing user', async () => {
    const { signToken, verifyToken } = await import('../src/services/authService.js');
    const user = {
      id: '00000000-0000-0000-0000-000000000001',
      username: 'tenantuser',
      tenant_id: '00000000-0000-0000-0000-000000000010',
    };
    process.env.PQ_AUTH_ENABLED = 'false';
    const token = signToken(user);
    const payload = verifyToken(token);
    assert.equal(payload.tenantId, user.tenant_id);
  });

  it('tenant theme schema validates hex colors', async () => {
    const { tenantThemeSchema } = await import('../src/validation/schemas.js');
    const result = tenantThemeSchema.safeParse({
      primaryColor: '#8B5CF6',
      appName: 'Acme',
    });
    assert.equal(result.success, true);
  });

  it('affective context still builds under tenant work', () => {
    const ctx = buildAffectiveAiContext({ hrvScore: 0.6, facialValence: 0.2, voiceStress: 0.3 });
    assert.ok(ctx.promptBlock.includes('AFFECTIVE'));
  });
});
