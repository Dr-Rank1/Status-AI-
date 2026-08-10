import { query } from '../config/database.js';
import { generateEmbedding, formatVectorForPg } from './embeddingService.js';
import { logger } from '../utils/logger.js';

const MEMORY_TOP_K = parseInt(process.env.MEMORY_TOP_K ?? '5', 10);
const MEMORY_MIN_SCORE = parseFloat(process.env.MEMORY_MIN_SCORE ?? '0.72');

function isPgVectorUnavailable(err) {
  const msg = String(err.message);
  return msg.includes('vector') || msg.includes('character_memories');
}

export async function storeCharacterMemory({
  userId,
  characterId,
  threadId,
  content,
  memoryType = 'dm_turn',
  metadata = {},
  importance = 1.0,
}) {
  const text = content?.trim();
  if (!text) return null;

  try {
    const { embedding, provider } = await generateEmbedding(text);
    const vectorLiteral = formatVectorForPg(embedding);

    const { rows } = await query(
      `INSERT INTO character_memories (
         user_id, character_id, thread_id, memory_type, content, embedding, metadata, importance
       )
       VALUES ($1, $2, $3, $4, $5, $6::vector, $7, $8)
       RETURNING id, created_at`,
      [
        userId,
        characterId,
        threadId ?? null,
        memoryType,
        text,
        vectorLiteral,
        JSON.stringify({ ...metadata, embeddingProvider: provider }),
        importance,
      ]
    );

    logger.info(`[VectorMemory] Stored ${memoryType} for user=${userId.slice(0, 8)}…`);

    try {
      const { replicateMemoryToEdge } = await import('./edge/edgeVectorStore.js');
      await replicateMemoryToEdge({
        id: rows[0].id,
        userId,
        characterId,
        content: text,
        embedding,
        residencyZone: metadata.residencyZone ?? process.env.SOVEREIGN_DEFAULT_ZONE ?? 'US',
      });
    } catch {
      // best-effort edge fan-out
    }

    return rows[0];
  } catch (err) {
    if (isPgVectorUnavailable(err)) {
      logger.warn('[VectorMemory] Store skipped:', err.message);
    }
    return null;
  }
}

export async function storeInteractionMemory({
  userId,
  characterId,
  threadId,
  userMessage,
  aiMessage,
  interactionType = 'dm',
  sentiment,
}) {
  const combined = [
    `User: ${userMessage}`,
    aiMessage ? `Character: ${aiMessage}` : null,
  ]
    .filter(Boolean)
    .join('\n');

  const importance =
    sentiment === 'positive' ? 1.3 : sentiment === 'negative' ? 0.8 : 1.0;

  return storeCharacterMemory({
    userId,
    characterId,
    threadId,
    content: combined,
    memoryType: interactionType === 'post_reply' ? 'post_reply' : 'dm_turn',
    metadata: { sentiment, interactionType },
    importance,
  });
}

export async function retrieveRelevantMemories({
  userId,
  characterId,
  queryText,
  limit = MEMORY_TOP_K,
  minScore = MEMORY_MIN_SCORE,
}) {
  const trimmed = queryText?.trim();
  if (!trimmed) return [];

  try {
    const { embedding } = await generateEmbedding(trimmed);
    const vectorLiteral = formatVectorForPg(embedding);

    const { rows } = await query(
      `SELECT
         id,
         content,
         memory_type,
         metadata,
         importance,
         created_at,
         1 - (embedding <=> $1::vector) AS similarity
       FROM character_memories
       WHERE user_id = $2
         AND character_id = $3
       ORDER BY embedding <=> $1::vector
       LIMIT $4`,
      [vectorLiteral, userId, characterId, limit]
    );

    return rows.filter((row) => parseFloat(row.similarity) >= minScore);
  } catch (err) {
    logger.warn('[VectorMemory] Retrieve skipped:', err.message);
    return [];
  }
}

export async function enrichDmContextWithVectorMemories({
  userId,
  characterId,
  userMessageContent,
  context,
  req = null,
  ragOptions = null,
}) {
  const topK = ragOptions?.topK ?? MEMORY_TOP_K;
  const minScore = ragOptions?.minScore ?? MEMORY_MIN_SCORE;

  const runRetrieve = async () =>
    retrieveRelevantMemories({
      userId,
      characterId,
      queryText: userMessageContent,
      limit: topK,
      minScore,
    });

  if (req?.sovereign?.zone) {
    try {
      const { guardCrossBorderQuery, filterMemoriesByResidency } = await import(
        './sovereign/sovereignCloudService.js'
      );
      guardCrossBorderQuery(req, req.sovereign.zone);
      const vectorMemories = await runRetrieve();
      return {
        ...context,
        vectorMemories: filterMemoriesByResidency(vectorMemories, req.sovereign.zone),
        residencyZone: req.sovereign.zone,
        ragWeights: ragOptions ?? context.ragWeights,
      };
    } catch (err) {
      if (err.code === 'SOVEREIGN_RESIDENCY_VIOLATION') throw err;
      logger.warn('[VectorMemory] Sovereign enrich fallback:', err.message);
    }
  }

  // Prefer edge replica for wearable/spatial low-latency paths
  if (context?.preferEdge || process.env.EDGE_VECTOR_READ_PREFERRED === 'true') {
    try {
      const { fetchEdgeMemories } = await import('./edge/edgeVectorStore.js');
      const edge = await fetchEdgeMemories({
        userId,
        characterId,
        limit: topK,
        regionHint: req?.sovereign?.readRegion,
      });
      if (edge.rows?.length) {
        return {
          ...context,
          vectorMemories: edge.rows,
          memorySource: edge.source,
          ragWeights: ragOptions ?? context.ragWeights,
        };
      }
    } catch (err) {
      logger.warn('[VectorMemory] Edge read skipped:', err.message);
    }
  }

  const vectorMemories = await runRetrieve();

  return {
    ...context,
    vectorMemories,
    ragWeights: ragOptions ?? context.ragWeights,
  };
}
