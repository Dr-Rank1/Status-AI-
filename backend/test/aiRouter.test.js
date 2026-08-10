import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { selectProvider } from '../src/services/ai/router.js';

describe('ai router', () => {
  const saved = {};

  beforeEach(() => {
    saved.anthropic = process.env.ANTHROPIC_API_KEY;
    saved.gemini = process.env.GEMINI_API_KEY;
    saved.openai = process.env.OPENAI_API_KEY;
  });

  afterEach(() => {
    process.env.ANTHROPIC_API_KEY = saved.anthropic;
    process.env.GEMINI_API_KEY = saved.gemini;
    process.env.OPENAI_API_KEY = saved.openai;
  });

  it('routes feed posts to gemini when available', () => {
    process.env.GEMINI_API_KEY = 'test-key';
    delete process.env.ANTHROPIC_API_KEY;

    const route = selectProvider({ mode: 'autonomous_post', context: {} });
    assert.equal(route.provider, 'gemini');
  });

  it('routes deep DMs to anthropic when available', () => {
    process.env.ANTHROPIC_API_KEY = 'test-key';
    process.env.GEMINI_API_KEY = 'test-key';

    const route = selectProvider({
      mode: 'dm',
      context: { recentMessages: [{}, {}, {}, {}], memorySummary: 'long history' },
    });
    assert.equal(route.provider, 'anthropic');
  });

  it('falls back to mock when no keys configured', () => {
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.GEMINI_API_KEY;
    delete process.env.OPENAI_API_KEY;

    const route = selectProvider({ mode: 'dm', context: {} });
    assert.equal(route.provider, 'mock');
  });
});
