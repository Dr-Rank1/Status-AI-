/**
 * Phase 50 — Multi-epoch chrono-vector storage router.
 * Indexes memories/analytics by epoch_id so any loop iteration can query
 * past, present, or "future" (projected) phase iterations.
 * In-memory + optional SQL upsert path; additive over spacetime manifold.
 */

import crypto from 'crypto';
import { logger } from '../../utils/logger.js';
import {
  embedOnManifold,
  manifoldDistance,
  upsertManifoldMemory,
  searchManifold,
} from '../memory/spacetimeManifoldStore.js';

/** @type {Array<{id:string,epochId:number,phase:number|null,content:string,coords:number[],kind:string,metadata:object,createdAt:string}>} */
const epochStore = [];

const MAX_ENTRIES = Number(process.env.MULTI_EPOCH_MAX_ENTRIES ?? 8000);

/**
 * Normalize epoch id (0 = Epoch Zero / Ouroboros; positive = cycle number).
 */
export function normalizeEpochId(epochId) {
  const n = Number(epochId);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.floor(n);
}

/**
 * Upsert a chrono-vector memory for a given epoch (and optional phase).
 */
export function upsertEpochMemory({
  id = null,
  epochId = 0,
  phase = null,
  content,
  vector = null,
  kind = 'memory',
  metadata = {},
  projectFuture = false,
} = {}) {
  const eid = normalizeEpochId(epochId);
  const entry = {
    id: id ?? crypto.randomUUID(),
    epochId: eid,
    phase: phase == null ? null : Number(phase),
    content: String(content ?? ''),
    coords: embedOnManifold(content, { vector }),
    kind,
    metadata: {
      ...metadata,
      projectFuture: Boolean(projectFuture),
      temporalAspect: projectFuture ? 'future' : eid === 0 ? 'zero' : 'past_or_present',
    },
    createdAt: new Date().toISOString(),
  };

  const idx = epochStore.findIndex((m) => m.id === entry.id);
  if (idx >= 0) epochStore[idx] = entry;
  else {
    epochStore.push(entry);
    while (epochStore.length > MAX_ENTRIES) epochStore.shift();
  }

  // Mirror into spacetime manifold for cross-engine recall
  upsertManifoldMemory({
    id: `epoch:${entry.id}`,
    content: entry.content,
    vector: entry.coords,
    metadata: {
      epochId: entry.epochId,
      phase: entry.phase,
      kind: entry.kind,
      multiEpoch: true,
    },
  });

  return entry;
}

/**
 * Query across epochs: past / present / future projections.
 * epochIds: array or 'all'; temporalAspect: 'past'|'present'|'future'|'any'
 */
export function searchEpochMemories({
  query,
  queryVector = null,
  epochIds = 'all',
  phase = null,
  temporalAspect = 'any',
  topK = 8,
  temporalDilation = 1,
  gravityWarp = 0,
} = {}) {
  const q = embedOnManifold(query, { vector: queryVector });
  let pool = epochStore;

  if (epochIds !== 'all' && Array.isArray(epochIds)) {
    const set = new Set(epochIds.map(normalizeEpochId));
    pool = pool.filter((m) => set.has(m.epochId));
  }
  if (phase != null) {
    pool = pool.filter((m) => m.phase === Number(phase));
  }
  if (temporalAspect === 'future') {
    pool = pool.filter((m) => m.metadata?.projectFuture === true);
  } else if (temporalAspect === 'past') {
    pool = pool.filter((m) => m.epochId < normalizeEpochId(process.env.CURRENT_EPOCH_ID ?? 1)
      && !m.metadata?.projectFuture);
  } else if (temporalAspect === 'present') {
    const cur = normalizeEpochId(process.env.CURRENT_EPOCH_ID ?? 1);
    pool = pool.filter((m) => m.epochId === cur && !m.metadata?.projectFuture);
  }

  const scored = pool.map((m) => ({
    ...m,
    distance: manifoldDistance(q, m.coords, { temporalDilation, gravityWarp }),
  }));
  scored.sort((a, b) => a.distance - b.distance);
  const hits = scored.slice(0, topK);

  // Also offer manifold cross-hits tagged multiEpoch
  const manifold = searchManifold({
    query,
    queryVector,
    topK: Math.min(3, topK),
    temporalDilation,
    gravityWarp,
  });

  logger.info(
    `[MultiEpoch] search hits=${hits.length} aspect=${temporalAspect} epochs=${epochIds === 'all' ? 'all' : epochIds}`,
  );

  return {
    engine: 'multi-epoch-chrono-vector/v1',
    hits,
    manifoldCrossHits: manifold.hits.filter((h) => h.metadata?.multiEpoch),
    filter: { epochIds, phase, temporalAspect },
  };
}

/**
 * Performance analytics rollup by epoch / phase.
 */
export function getEpochAnalytics({ epochId = null } = {}) {
  const pool = epochId == null
    ? epochStore
    : epochStore.filter((m) => m.epochId === normalizeEpochId(epochId));

  const byEpoch = {};
  const byPhase = {};
  for (const m of pool) {
    byEpoch[m.epochId] = (byEpoch[m.epochId] ?? 0) + 1;
    if (m.phase != null) byPhase[m.phase] = (byPhase[m.phase] ?? 0) + 1;
  }

  return {
    engine: 'multi-epoch-chrono-vector/v1',
    total: pool.length,
    byEpoch,
    byPhase,
    kinds: Object.fromEntries(
      [...new Set(pool.map((m) => m.kind))].map((k) => [
        k,
        pool.filter((m) => m.kind === k).length,
      ]),
    ),
  };
}

export function getMultiEpochConfig() {
  return {
    engine: 'multi-epoch-chrono-vector/v1',
    stored: epochStore.length,
    maxEntries: MAX_ENTRIES,
    sqlMigration: 'backend/db/migrations/028_phase50_multi_epoch.sql',
    indexes: ['epoch_id', 'phase', 'hnsw(embedding)'],
    temporalAspects: ['past', 'present', 'future', 'any'],
  };
}

/** SQL upsert helper (no-op when pool unavailable). */
export async function persistEpochMemorySql(db, entry) {
  if (!db?.query) return { persisted: false };
  await db.query(
    `INSERT INTO multi_epoch_memories
      (id, epoch_id, phase, kind, content, embedding, metadata, created_at)
     VALUES ($1,$2,$3,$4,$5,$6::vector,$7::jsonb,$8)
     ON CONFLICT (id) DO UPDATE SET
       content = EXCLUDED.content,
       embedding = EXCLUDED.embedding,
       metadata = EXCLUDED.metadata,
       phase = EXCLUDED.phase,
       epoch_id = EXCLUDED.epoch_id`,
    [
      entry.id,
      entry.epochId,
      entry.phase,
      entry.kind,
      entry.content,
      `[${entry.coords.map((x) => Number(x) || 0).join(',')}]`,
      JSON.stringify(entry.metadata ?? {}),
      entry.createdAt,
    ],
  );
  return { persisted: true };
}

export function resetMultiEpochStore() {
  epochStore.length = 0;
}
