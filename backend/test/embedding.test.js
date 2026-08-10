import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { generateEmbedding, formatVectorForPg } from '../src/services/embeddingService.js';

describe('embeddingService', () => {
  const saved = process.env.OPENAI_API_KEY;

  beforeEach(() => {
    delete process.env.OPENAI_API_KEY;
  });

  afterEach(() => {
    process.env.OPENAI_API_KEY = saved;
  });

  it('generates deterministic mock embeddings', async () => {
    const a = await generateEmbedding('Hello Nova');
    const b = await generateEmbedding('Hello Nova');
    assert.equal(a.provider, 'mock-hash');
    assert.equal(a.embedding.length, 1536);
    assert.deepEqual(a.embedding, b.embedding);
  });

  it('formats vectors for pgvector literal', async () => {
    const { embedding } = await generateEmbedding('test');
    const literal = formatVectorForPg(embedding);
    assert.match(literal, /^\[[\d.,]+\]$/);
  });
});
