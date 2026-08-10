import { logger } from '../utils/logger.js';

const EMBEDDING_MODEL = process.env.EMBEDDING_MODEL ?? 'text-embedding-3-small';
const EMBEDDING_DIM = parseInt(process.env.EMBEDDING_DIM ?? '1536', 10);

function mockEmbedding(text) {
  const vec = new Array(EMBEDDING_DIM).fill(0);
  const normalized = text.toLowerCase();
  for (let i = 0; i < normalized.length; i++) {
    const code = normalized.charCodeAt(i);
    vec[i % EMBEDDING_DIM] += (code % 97) / 97;
    vec[(i * 7) % EMBEDDING_DIM] += ((code * 3) % 53) / 53;
  }
  const magnitude = Math.sqrt(vec.reduce((sum, v) => sum + v * v, 0)) || 1;
  return vec.map((v) => v / magnitude);
}

export async function generateEmbedding(text) {
  const trimmed = text?.trim();
  if (!trimmed) {
    return { embedding: mockEmbedding('empty'), provider: 'mock-empty' };
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (apiKey) {
    try {
      const response = await fetch('https://api.openai.com/v1/embeddings', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: EMBEDDING_MODEL,
          input: trimmed.slice(0, 8000),
        }),
      });

      if (!response.ok) {
        throw new Error(`Embedding API error ${response.status}`);
      }

      const data = await response.json();
      const embedding = data.data?.[0]?.embedding;
      if (!embedding?.length) {
        throw new Error('Empty embedding response');
      }

      return { embedding, provider: 'openai', model: EMBEDDING_MODEL };
    } catch (err) {
      logger.warn('[Embedding] OpenAI failed, using mock:', err.message);
    }
  }

  return { embedding: mockEmbedding(trimmed), provider: 'mock-hash' };
}

export function formatVectorForPg(embedding) {
  return `[${embedding.join(',')}]`;
}

export { EMBEDDING_DIM };
