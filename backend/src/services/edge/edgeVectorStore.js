/**
 * Phase 33 — Edge-replicated vector store (Turso / Cloudflare D1 / local Postgres).
 * Active-active abstraction for sub-ms spatial/wearable fetches.
 */

import { query } from '../../config/database.js';
import { logger } from '../../utils/logger.js';

const BACKEND = (process.env.EDGE_VECTOR_BACKEND ?? 'postgres').toLowerCase();
const EDGE_URL = process.env.EDGE_VECTOR_URL ?? '';
const EDGE_TOKEN = process.env.EDGE_VECTOR_TOKEN ?? '';

let edgeReady = false;

export function getEdgeVectorConfig() {
  return {
    backend: BACKEND,
    configured: BACKEND === 'postgres' || Boolean(EDGE_URL),
    regions: (process.env.EDGE_VECTOR_REGIONS ?? 'us-east-1,eu-west-1,ap-southeast-1')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
    ready: edgeReady || BACKEND === 'postgres',
  };
}

export async function initEdgeVectorStore() {
  if (BACKEND === 'postgres') {
    edgeReady = true;
    return getEdgeVectorConfig();
  }

  if (!EDGE_URL) {
    logger.warn('[EdgeVector] EDGE_VECTOR_URL unset — falling back to postgres');
    edgeReady = true;
    return { ...getEdgeVectorConfig(), backend: 'postgres', fallback: true };
  }

  try {
    // Turso / D1 HTTP ping
    const res = await fetch(EDGE_URL.replace(/\/$/, '') + '/health', {
      headers: EDGE_TOKEN ? { Authorization: `Bearer ${EDGE_TOKEN}` } : {},
      signal: AbortSignal.timeout(2000),
    }).catch(() => null);

    edgeReady = true;
    logger.info(`[EdgeVector] backend=${BACKEND} health=${res?.status ?? 'skipped'}`);
  } catch (err) {
    logger.warn('[EdgeVector] init soft-fail:', err.message);
    edgeReady = true;
  }

  return getEdgeVectorConfig();
}

/**
 * Upsert embedding replica to edge (best-effort fan-out).
 */
export async function replicateMemoryToEdge({
  id,
  userId,
  characterId,
  content,
  embedding,
  residencyZone = 'US',
  region = null,
}) {
  if (BACKEND === 'postgres' || !EDGE_URL) {
    return { replicated: false, backend: 'postgres', reason: 'local_only' };
  }

  const payload = {
    id,
    user_id: userId,
    character_id: characterId,
    content,
    embedding,
    residency_zone: residencyZone,
    region: region ?? process.env.REGION_ID ?? 'us-east-1',
    updated_at: new Date().toISOString(),
  };

  try {
    const res = await fetch(`${EDGE_URL.replace(/\/$/, '')}/vectors/upsert`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(EDGE_TOKEN ? { Authorization: `Bearer ${EDGE_TOKEN}` } : {}),
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(3000),
    });

    return { replicated: res.ok, status: res.status, backend: BACKEND };
  } catch (err) {
    logger.warn('[EdgeVector] replicate failed:', err.message);
    return { replicated: false, error: err.message, backend: BACKEND };
  }
}

/**
 * Read from nearest edge replica; fall back to origin Postgres.
 */
export async function fetchEdgeMemories({
  userId,
  characterId,
  limit = 5,
  regionHint = null,
}) {
  if (BACKEND !== 'postgres' && EDGE_URL) {
    try {
      const url = new URL(`${EDGE_URL.replace(/\/$/, '')}/vectors/query`);
      url.searchParams.set('user_id', userId);
      url.searchParams.set('character_id', characterId);
      url.searchParams.set('limit', String(limit));
      if (regionHint) url.searchParams.set('region', regionHint);

      const res = await fetch(url, {
        headers: EDGE_TOKEN ? { Authorization: `Bearer ${EDGE_TOKEN}` } : {},
        signal: AbortSignal.timeout(800),
      });

      if (res.ok) {
        const data = await res.json();
        return { source: BACKEND, rows: data.rows ?? data.data ?? [] };
      }
    } catch (err) {
      logger.warn('[EdgeVector] edge read miss — origin fallback:', err.message);
    }
  }

  const { rows } = await query(
    `SELECT id, content, memory_type, metadata, importance, created_at
     FROM character_memories
     WHERE user_id = $1 AND character_id = $2
     ORDER BY created_at DESC
     LIMIT $3`,
    [userId, characterId, limit],
  );

  return { source: 'postgres-origin', rows };
}
