import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { applyFlagRouting } from '../src/services/ai/flagRouting.js';
import { buildFlagSnapshotProperties, isFlagEnabled } from '../src/services/posthogService.js';
import { extractTokenUsage, estimateCostUsd } from '../src/services/aiTelemetryService.js';

describe('posthogService helpers', () => {
  it('builds $feature/* snapshot properties', () => {
    const props = buildFlagSnapshotProperties({
      'force-gemini-dm': true,
      'enable-3d-avatars': false,
    });
    assert.equal(props['$feature/force-gemini-dm'], true);
    assert.equal(props['$feature/enable-3d-avatars'], false);
  });

  it('isFlagEnabled handles boolean and string values', () => {
    assert.equal(isFlagEnabled({ 'force-gemini-dm': true }, 'force-gemini-dm'), true);
    assert.equal(isFlagEnabled({ 'force-gemini-dm': 'true' }, 'force-gemini-dm'), true);
    assert.equal(isFlagEnabled({ 'force-gemini-dm': false }, 'force-gemini-dm'), false);
  });
});

describe('applyFlagRouting', () => {
  it('forces gemini for DMs when flag enabled', () => {
    process.env.GEMINI_API_KEY = 'test-key';
    const result = applyFlagRouting({
      provider: 'anthropic',
      reason: 'deep_dm_context',
      mode: 'dm',
      flags: { 'force-gemini-dm': true },
    });
    assert.equal(result.provider, 'gemini');
    assert.equal(result.reason, 'posthog_force_gemini_dm');
    delete process.env.GEMINI_API_KEY;
  });

  it('falls back to mock when disable-ai-providers flag is on', () => {
    const result = applyFlagRouting({
      provider: 'gemini',
      reason: 'feed_generation',
      mode: 'post_reply',
      flags: { 'disable-ai-providers': true },
    });
    assert.equal(result.provider, 'mock');
    assert.equal(result.reason, 'posthog_disable_ai');
  });
});

describe('aiTelemetryService', () => {
  it('extracts Gemini token usage', () => {
    const usage = extractTokenUsage('gemini', {
      promptTokenCount: 100,
      candidatesTokenCount: 50,
    });
    assert.equal(usage.inputTokens, 100);
    assert.equal(usage.outputTokens, 50);
  });

  it('estimates cost from token counts', () => {
    const cost = estimateCostUsd('gemini-2.5-flash', 1000, 500);
    assert.ok(cost > 0);
  });
});
