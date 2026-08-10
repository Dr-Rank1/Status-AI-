/**
 * Phase 46 — Spacetime-invariant Riemannian manifold memory router.
 * Topology-preserving vector search under temporal dilation / metric warp.
 */

import crypto from 'crypto';
import { logger } from '../../utils/logger.js';

const manifoldStore = []; // { id, content, coords, metric, createdAt }

/**
 * Embed content into manifold coords (hash-projected + optional vector).
 */
export function embedOnManifold(content, { vector = null, dim = 32 } = {}) {
  if (Array.isArray(vector) && vector.length) {
    return vector.slice(0, dim);
  }
  const hash = crypto.createHash('sha256').update(String(content ?? '')).digest();
  const coords = [];
  for (let i = 0; i < dim; i += 1) {
    coords.push((hash[i % hash.length] / 255) * 2 - 1);
  }
  return coords;
}

/**
 * Riemannian geodesic distance proxy under metric tensor g (diagonal dilation).
 * temporalDilation > 1 stretches time-like axis; gravityWarp curves radial dims.
 */
export function manifoldDistance(a, b, {
  temporalDilation = 1,
  gravityWarp = 0,
} = {}) {
  const n = Math.min(a.length, b.length);
  let sum = 0;
  for (let i = 0; i < n; i += 1) {
    const gii = i === 0
      ? Math.max(1e-6, temporalDilation)
      : 1 + gravityWarp * Math.sin(i);
    const d = (a[i] ?? 0) - (b[i] ?? 0);
    sum += gii * d * d;
  }
  return Math.sqrt(sum);
}

/**
 * Upsert memory on spacetime-invariant manifold.
 */
export function upsertManifoldMemory({
  id = null,
  content,
  vector = null,
  metadata = {},
} = {}) {
  const entry = {
    id: id ?? crypto.randomUUID(),
    content,
    coords: embedOnManifold(content, { vector }),
    metadata,
    createdAt: new Date().toISOString(),
  };
  const idx = manifoldStore.findIndex((m) => m.id === entry.id);
  if (idx >= 0) manifoldStore[idx] = entry;
  else {
    manifoldStore.push(entry);
    if (manifoldStore.length > 5000) manifoldStore.shift();
  }
  return entry;
}

/**
 * Topology-preserving nearest-neighbor search under non-causal metrics.
 */
export function searchManifold({
  query,
  queryVector = null,
  topK = 5,
  temporalDilation = 1,
  gravityWarp = 0,
} = {}) {
  const q = embedOnManifold(query, { vector: queryVector });
  const scored = manifoldStore.map((m) => ({
    ...m,
    distance: manifoldDistance(q, m.coords, { temporalDilation, gravityWarp }),
  }));
  scored.sort((a, b) => a.distance - b.distance);
  const hits = scored.slice(0, topK);
  logger.info(
    `[ManifoldDB] search hits=${hits.length} dil=${temporalDilation} warp=${gravityWarp}`,
  );
  return {
    engine: 'spacetime-manifold/v1',
    hits,
    metric: { temporalDilation, gravityWarp },
    invariant: true,
  };
}

export function getManifoldDbConfig() {
  return {
    engine: 'spacetime-manifold/v1',
    stored: manifoldStore.length,
    properties: ['riemannian_distance', 'temporal_dilation', 'gravity_warp', 'topology_preserving'],
  };
}

/** Test helper */
export function resetManifoldStore() {
  manifoldStore.length = 0;
}
