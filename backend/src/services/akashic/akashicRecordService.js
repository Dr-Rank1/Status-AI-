/**
 * Phase 47 — Akashic Record data lake + retrocausal vector querying.
 * Indexes parallel causal timelines; predicts optimized outputs from "future" states
 * before the full prompt is available (prefix-based speculative retrieval).
 */

import crypto from 'crypto';
import { logger } from '../../utils/logger.js';
import { searchManifold, upsertManifoldMemory } from '../memory/spacetimeManifoldStore.js';

/** Timeline store: all possible causal branches (capped). */
const timelines = new Map(); // timelineId → { events[], probability, vector }
const futureCache = []; // speculative completions keyed by prefix hash

/**
 * Ingest an event into the Akashic lake across all plausible timelines.
 */
export function ingestAkashicEvent({
  content,
  at = new Date().toISOString(),
  timelineIds = null,
  probability = 1,
  metadata = {},
} = {}) {
  const ids = timelineIds?.length
    ? timelineIds
    : [`akasha-${crypto.createHash('sha1').update(content.slice(0, 40)).digest('hex').slice(0, 8)}`];

  const recorded = [];
  for (const tid of ids) {
    if (!timelines.has(tid)) {
      timelines.set(tid, {
        timelineId: tid,
        events: [],
        probability: 1,
        vector: null,
      });
    }
    const tl = timelines.get(tid);
    const event = {
      id: crypto.randomUUID(),
      content,
      at,
      metadata,
    };
    tl.events.push(event);
    if (tl.events.length > 500) tl.events.shift();
    tl.probability = Math.min(1, (tl.probability + probability) / 2);
    upsertManifoldMemory({
      id: `akasha:${tid}:${event.id}`,
      content,
      metadata: { ...metadata, timelineId: tid, akashic: true },
    });
    recorded.push({ timelineId: tid, eventId: event.id });
  }

  // Seed retrocausal future cache from partial prefixes
  seedRetrocausalCache(content);
  logger.info(`[Akashic] ingest timelines=${ids.length} content_len=${content.length}`);
  return { recorded, lakeSize: timelines.size };
}

function seedRetrocausalCache(content) {
  const words = String(content).trim().split(/\s+/);
  if (words.length < 2) return;
  for (let i = 1; i < Math.min(words.length, 8); i += 1) {
    const prefix = words.slice(0, i).join(' ').toLowerCase();
    const completion = words.slice(i).join(' ');
    const key = crypto.createHash('sha1').update(prefix).digest('hex').slice(0, 16);
    futureCache.unshift({
      key,
      prefix,
      completion,
      utility: 0.5 + Math.min(0.4, completion.length / 200),
      at: new Date().toISOString(),
    });
  }
  while (futureCache.length > 2000) futureCache.pop();
}

/**
 * Retrocausal vector query — retrieve optimized outputs from "future" states
 * using a partial prompt prefix (before the user finishes typing).
 */
export function retrocausalQuery({
  partialPrompt = '',
  topK = 5,
  temporalDilation = 1,
} = {}) {
  const prefix = String(partialPrompt).trim().toLowerCase();
  const key = crypto.createHash('sha1').update(prefix).digest('hex').slice(0, 16);

  const speculative = futureCache
    .filter((f) => f.prefix.startsWith(prefix) || prefix.startsWith(f.prefix) || f.key === key)
    .sort((a, b) => b.utility - a.utility)
    .slice(0, topK);

  // Also pull Akashic / manifold neighbors as "future-aligned" memory
  const manifold = searchManifold({
    query: prefix || 'akasha',
    topK,
    temporalDilation,
    gravityWarp: 0.1,
  });

  const predictions = speculative.map((s) => ({
    type: 'retrocausal_completion',
    prefix: s.prefix,
    predictedOutput: s.completion,
    utility: s.utility,
    source: 'future_cache',
  }));

  for (const hit of manifold.hits ?? []) {
    predictions.push({
      type: 'akashic_memory',
      predictedOutput: hit.content,
      utility: 1 / (1 + hit.distance),
      source: 'akashic_manifold',
      distance: hit.distance,
    });
  }

  predictions.sort((a, b) => b.utility - a.utility);

  return {
    engine: 'akashic-retrocausal/v1',
    partialPrompt: prefix,
    predictions: predictions.slice(0, topK),
    timelinesIndexed: timelines.size,
    beforePromptComplete: true,
  };
}

export function listAkashicTimelines({ limit = 20 } = {}) {
  return [...timelines.values()]
    .slice(0, limit)
    .map((t) => ({
      timelineId: t.timelineId,
      events: t.events.length,
      probability: t.probability,
    }));
}

export function getAkashicConfig() {
  return {
    timelines: timelines.size,
    futureCache: futureCache.length,
    engine: 'akashic-retrocausal/v1',
    storesAllCausalTimelines: true,
  };
}

/** Test helper */
export function resetAkashicState() {
  timelines.clear();
  futureCache.length = 0;
}
