import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { moderateText } from '../src/services/moderationService.js';

describe('moderationService', () => {
  const saved = process.env.OPENAI_API_KEY;

  beforeEach(() => {
    delete process.env.OPENAI_API_KEY;
  });

  afterEach(() => {
    process.env.OPENAI_API_KEY = saved;
  });

  it('allows clean text in mock mode', async () => {
    const result = await moderateText('Hello, how are you today?');
    assert.equal(result.flagged, false);
  });

  it('flags blocked phrases in mock mode', async () => {
    const result = await moderateText('you should kys right now');
    assert.equal(result.flagged, true);
    assert.ok(result.message);
  });
});
