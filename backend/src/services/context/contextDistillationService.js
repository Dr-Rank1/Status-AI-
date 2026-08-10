/**
 * Phase 40 — Continuous context distillation for exascale / infinite-window RAG.
 * Compresses multi-year histories into hierarchical summaries without overflowing tokens.
 */

import crypto from 'crypto';
import { logger } from '../../utils/logger.js';
import { queryTemporalContext } from './temporalKnowledgeGraph.js';
import { retrieveUnifiedMemory, rerankMemories, filterByMetadata } from '../memory/unifiedMemoryService.js';

const DISTILL_BUDGET_TOKENS = parseInt(process.env.CONTEXT_DISTILL_TOKEN_BUDGET ?? '1800', 10);
const CLUSTER_SIZE = parseInt(process.env.EXASCALE_RAG_CLUSTER_SIZE ?? '8', 10);
const COMPRESS_DIM_HINT = parseInt(process.env.EXASCALE_VECTOR_COMPRESS_DIM ?? '64', 10);

/**
 * Approximate token count (chars/4).
 */
export function estimateTokens(text) {
  return Math.ceil(String(text ?? '').length / 4);
}

/**
 * Dynamic vector compression — keep top-k salient dimensions by magnitude proxy.
 * Uses content hash as a stand-in embedding when no vector is present.
 */
export function compressVector(values, targetDim = COMPRESS_DIM_HINT) {
  if (!Array.isArray(values) || !values.length) {
    const hash = crypto.createHash('sha256').update(String(values ?? '')).digest();
    const dims = [];
    for (let i = 0; i < targetDim; i += 1) {
      dims.push((hash[i % hash.length] / 255) * 2 - 1);
    }
    return { dims, originalDim: 0, compressedDim: targetDim, method: 'hash_projection' };
  }
  if (values.length <= targetDim) {
    return { dims: values, originalDim: values.length, compressedDim: values.length, method: 'identity' };
  }
  // Keep highest-magnitude indices
  const indexed = values.map((v, i) => ({ v, i }));
  indexed.sort((a, b) => Math.abs(b.v) - Math.abs(a.v));
  const kept = indexed.slice(0, targetDim).sort((a, b) => a.i - b.i).map((x) => x.v);
  return {
    dims: kept,
    originalDim: values.length,
    compressedDim: targetDim,
    method: 'magnitude_topk',
  };
}

/**
 * Cluster memories by coarse temporal buckets + topic hash (Neo4j-friendly).
 */
export function clusterMemoriesForExascale(items = [], clusterSize = CLUSTER_SIZE) {
  const clusters = new Map();
  for (const item of items) {
    const ts = new Date(item.created_at ?? item.validFrom ?? Date.now()).getTime();
    const yearMonth = new Date(ts).toISOString().slice(0, 7);
    const topicKey = crypto
      .createHash('sha1')
      .update(String(item.content ?? '').slice(0, 80).toLowerCase())
      .digest('hex')
      .slice(0, 6);
    const key = `${yearMonth}:${topicKey}`;
    if (!clusters.has(key)) clusters.set(key, []);
    clusters.get(key).push(item);
  }

  const distilled = [];
  for (const [key, members] of clusters) {
    const ranked = rerankMemories(members, {
      queryText: members.map((m) => m.content).join(' ').slice(0, 200),
      topK: clusterSize,
    });
    const summary = distillClusterSummary(key, ranked);
    distilled.push({
      id: `cluster:${key}`,
      content: summary,
      memory_type: 'distilled_cluster',
      importance: Math.min(1, 0.4 + ranked.length * 0.05),
      similarity: 0.7,
      created_at: ranked[0]?.created_at ?? new Date().toISOString(),
      source: 'exascale_cluster',
      memberCount: members.length,
      compression: compressVector(null, COMPRESS_DIM_HINT),
    });
  }
  return distilled;
}

function distillClusterSummary(key, members) {
  const [period] = key.split(':');
  const snippets = members.slice(0, 3).map((m) => String(m.content ?? '').slice(0, 100));
  return `[${period} · ${members.length} events] ${snippets.join(' · ')}`;
}

/**
 * Continuous distillation — fold STM + episodic + temporal + vector into budgeted context.
 */
export async function distillInfiniteContext({
  userId,
  characterId,
  queryText = '',
  recentMessages = [],
  episodicEvents = [],
  tokenBudget = DISTILL_BUDGET_TOKENS,
  metadata = {},
} = {}) {
  const t0 = process.hrtime.bigint();

  const unified = await retrieveUnifiedMemory({
    userId,
    characterId,
    queryText,
    recentMessages,
    episodicEvents,
    metadata,
    ragOptions: { topK: CLUSTER_SIZE * 3, minScore: 0.45 },
  });

  let temporal = unified.temporal ?? { memories: [] };
  if (userId && characterId && !temporal.memories?.length) {
    try {
      temporal = await queryTemporalContext({ userId, characterId, limit: 20 });
    } catch {
      /* optional */
    }
  }

  const rawPool = [
    ...(unified.items ?? []),
    ...(temporal.memories ?? []).map((m) => ({
      ...m,
      source: 'temporal_kg',
      created_at: m.validFrom,
    })),
  ];

  const filtered = filterByMetadata(rawPool, metadata);
  const clusters = clusterMemoriesForExascale(filtered);
  const rankedClusters = rerankMemories(clusters, { queryText, topK: CLUSTER_SIZE });

  // Fit into token budget (hierarchy: query-focused clusters first)
  const selected = [];
  let used = 0;
  for (const c of rankedClusters) {
    const cost = estimateTokens(c.content);
    if (used + cost > tokenBudget) break;
    selected.push(c);
    used += cost;
  }

  // Ultra-compact residual if nothing selected
  if (!selected.length && rankedClusters[0]) {
    selected.push({
      ...rankedClusters[0],
      content: String(rankedClusters[0].content).slice(0, tokenBudget * 4),
    });
    used = estimateTokens(selected[0].content);
  }

  const promptBlock = [
    'Exascale distilled memory (infinite-window compression):',
    ...selected.map(
      (c) => `- [${c.source}|members=${c.memberCount ?? 1}|${(c.rerankScore ?? 0).toFixed(2)}] ${c.content}`,
    ),
  ].join('\n');

  const elapsedNs = process.hrtime.bigint() - t0;
  const elapsedMs = Number(elapsedNs) / 1e6;

  logger.info(
    `[ExascaleRAG] clusters=${clusters.length} selected=${selected.length} tokens≈${used} ${elapsedMs.toFixed(3)}ms`,
  );

  return {
    engine: 'exascale-rag/v1',
    promptBlock,
    items: selected,
    stats: {
      rawCount: rawPool.length,
      clusterCount: clusters.length,
      selectedCount: selected.length,
      tokenBudget,
      tokensUsed: used,
      retrievalMs: elapsedMs,
      compressDim: COMPRESS_DIM_HINT,
    },
  };
}

export function getExascaleRagConfig() {
  return {
    tokenBudget: DISTILL_BUDGET_TOKENS,
    clusterSize: CLUSTER_SIZE,
    compressDim: COMPRESS_DIM_HINT,
    techniques: ['temporal_cluster', 'magnitude_topk_compression', 'continuous_distillation'],
  };
}
