/**
 * Phase 37 — Unified memory layer + advanced RAG (metadata filter + re-rank).
 * Connects short-term window, episodic logs, temporal KG, and vector memories.
 */

import { retrieveRelevantMemories } from '../vectorMemoryService.js';
import { queryTemporalContext, formatTemporalPromptBlock } from '../context/temporalKnowledgeGraph.js';
import { logger } from '../../utils/logger.js';

const SHORT_TERM_MAX = parseInt(process.env.UNIFIED_MEMORY_SHORT_TERM ?? '12', 10);
const RERANK_TOP_K = parseInt(process.env.UNIFIED_MEMORY_RERANK_K ?? '6', 10);

/**
 * Metadata filter for RAG candidates.
 */
export function filterByMetadata(items, {
  memoryTypes = null,
  minImportance = null,
  tags = null,
  since = null,
  until = null,
} = {}) {
  return (items ?? []).filter((item) => {
    if (memoryTypes?.length) {
      const t = item.memory_type ?? item.memoryType ?? item.source;
      if (!memoryTypes.includes(t)) return false;
    }
    if (minImportance != null) {
      const imp = Number(item.importance ?? 0);
      if (imp < minImportance) return false;
    }
    if (tags?.length) {
      const metaTags = item.metadata?.tags ?? item.tags ?? [];
      if (!tags.some((t) => metaTags.includes(t))) return false;
    }
    if (since) {
      const ts = new Date(item.created_at ?? item.validFrom ?? 0).getTime();
      if (ts < new Date(since).getTime()) return false;
    }
    if (until) {
      const ts = new Date(item.created_at ?? item.validFrom ?? 0).getTime();
      if (ts > new Date(until).getTime()) return false;
    }
    return true;
  });
}

/**
 * Re-rank by blended similarity, importance, recency, and metadata boosts.
 */
export function rerankMemories(items, {
  queryText = '',
  topK = RERANK_TOP_K,
  weights = { similarity: 0.55, importance: 0.2, recency: 0.15, keyword: 0.1 },
} = {}) {
  const now = Date.now();
  const qTokens = tokenize(queryText);

  const scored = (items ?? []).map((item) => {
    const similarity = Number(item.similarity ?? item.score ?? 0.5);
    const importance = Number(item.importance ?? 0.5);
    const ts = new Date(item.created_at ?? item.validFrom ?? now).getTime();
    const ageDays = Math.max(0, (now - ts) / 86_400_000);
    const recency = Math.exp(-ageDays / 30);
    const content = String(item.content ?? '');
    const overlap = qTokens.filter((t) => content.toLowerCase().includes(t)).length;
    const keyword = qTokens.length ? overlap / qTokens.length : 0;

    const score =
      weights.similarity * similarity
      + weights.importance * importance
      + weights.recency * recency
      + weights.keyword * keyword;

    return {
      ...item,
      rerankScore: score,
      rerankComponents: { similarity, importance, recency, keyword },
    };
  });

  scored.sort((a, b) => b.rerankScore - a.rerankScore);
  return scored.slice(0, topK);
}

function tokenize(text) {
  return String(text ?? '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 2)
    .slice(0, 24);
}

/**
 * Unified retrieval across STM / episodic / temporal / vector.
 */
export async function retrieveUnifiedMemory({
  userId,
  characterId,
  queryText,
  threadId = null,
  recentMessages = [],
  episodicEvents = [],
  metadata = {},
  ragOptions = {},
} = {}) {
  const topK = ragOptions.topK ?? RERANK_TOP_K;
  const minScore = ragOptions.minScore ?? parseFloat(process.env.MEMORY_MIN_SCORE ?? '0.72');

  // 1) Short-term context window
  const shortTerm = (recentMessages ?? [])
    .slice(-SHORT_TERM_MAX)
    .map((m, i) => ({
      id: `stm-${i}`,
      content: m.content ?? m.text ?? '',
      memory_type: 'short_term',
      importance: 0.4,
      similarity: 0.55,
      created_at: m.created_at ?? new Date().toISOString(),
      source: 'short_term',
    }));

  // 2) Episodic event log
  const episodic = (episodicEvents ?? []).map((e, i) => ({
    id: e.id ?? `ep-${i}`,
    content: e.summary ?? e.content ?? JSON.stringify(e),
    memory_type: 'episodic',
    importance: e.importance ?? 0.6,
    similarity: 0.5,
    created_at: e.at ?? e.created_at ?? new Date().toISOString(),
    metadata: { tags: e.tags ?? ['episodic'] },
    source: 'episodic',
  }));

  // 3) Temporal KG
  let temporal = { backend: 'skipped', memories: [], relation: null };
  if (userId && characterId) {
    try {
      temporal = await queryTemporalContext({
        userId,
        characterId,
        limit: topK,
      });
    } catch (err) {
      logger.warn(`[UnifiedMemory] temporal skipped: ${err.message}`);
    }
  }
  const temporalItems = (temporal.memories ?? []).map((m) => ({
    id: m.id,
    content: m.content,
    memory_type: 'temporal',
    importance: m.importance ?? 0.55,
    similarity: 0.6,
    created_at: m.validFrom,
    validFrom: m.validFrom,
    source: 'temporal_kg',
    metadata: { tags: ['temporal'] },
  }));

  // 4) Vector RAG
  let vectorItems = [];
  if (userId && characterId && queryText) {
    try {
      vectorItems = await retrieveRelevantMemories({
        userId,
        characterId,
        queryText,
        limit: Math.max(topK * 2, 8),
        minScore: Math.max(0.4, minScore - 0.1),
      });
      vectorItems = vectorItems.map((v) => ({ ...v, source: 'vector' }));
    } catch (err) {
      logger.warn(`[UnifiedMemory] vector skipped: ${err.message}`);
    }
  }

  const merged = [...shortTerm, ...episodic, ...temporalItems, ...vectorItems];
  const filtered = filterByMetadata(merged, metadata);
  const ranked = rerankMemories(filtered, { queryText, topK });

  const promptBlock = [
    formatTemporalPromptBlock(temporal),
    ranked.length
      ? [
          'Unified memory (re-ranked):',
          ...ranked.map(
            (m) => `- [${m.source}|${(m.rerankScore ?? 0).toFixed(2)}] ${String(m.content).slice(0, 220)}`,
          ),
        ].join('\n')
      : null,
  ]
    .filter(Boolean)
    .join('\n\n');

  logger.info(
    `[UnifiedMemory] stm=${shortTerm.length} ep=${episodic.length} temporal=${temporalItems.length} vector=${vectorItems.length} out=${ranked.length}`,
  );

  return {
    engine: 'unified-memory/v1',
    items: ranked,
    temporal,
    counts: {
      shortTerm: shortTerm.length,
      episodic: episodic.length,
      temporal: temporalItems.length,
      vector: vectorItems.length,
      returned: ranked.length,
    },
    promptBlock,
    threadId,
  };
}

export function getUnifiedMemoryConfig() {
  return {
    shortTermMax: SHORT_TERM_MAX,
    rerankTopK: RERANK_TOP_K,
    layers: ['short_term', 'episodic', 'temporal_kg', 'vector'],
    features: ['metadata_filter', 'rerank'],
  };
}
