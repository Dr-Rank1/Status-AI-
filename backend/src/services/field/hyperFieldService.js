/**
 * Phase 46 — Hyper-dimensional consciousness field sync (Node mirror of hyper_field_bridge).
 * Feeds concurrent causality trees into ContextEngine without dimensional collapse.
 */

import crypto from 'crypto';
import { logger } from '../../utils/logger.js';

const DIMS = parseInt(process.env.HYPER_FIELD_DIMS ?? '16', 10);
const causalityTrees = [];

export function projectToHyperField(features = [], dims = DIMS) {
  const coords = [];
  const n = Math.max(features.length, 1);
  for (let i = 0; i < dims; i += 1) {
    let acc = 0;
    for (let j = 0; j < features.length; j += 1) {
      acc += Number(features[j] || 0) * Math.sin(0.37 * (i + 1) * (j + 1));
    }
    coords.push(Math.tanh(acc / n));
  }
  return { coords, dims, backend: process.env.HYPER_FIELD_BACKEND ?? 'sim' };
}

export function syncHyperFields(a = [], b = [], mix = 0.5) {
  const dims = Math.min(a.length, b.length) || DIMS;
  const m = Math.max(0, Math.min(1, mix));
  const merged = [];
  for (let i = 0; i < dims; i += 1) {
    merged.push((a[i] ?? 0) * (1 - m) + (b[i] ?? 0) * m);
  }
  return { coords: merged, dims, mix: m };
}

/**
 * Register a causality tree branch (infinite concurrent trees — capped in memory).
 */
export function registerCausalityTree({
  rootEvent = '',
  branches = [],
  fieldCoords = [],
} = {}) {
  const tree = {
    id: crypto.randomUUID(),
    rootEvent,
    branches: branches.slice(0, 64),
    fieldCoords: fieldCoords.length ? fieldCoords : projectToHyperField([branches.length || 1]).coords,
    at: new Date().toISOString(),
  };
  causalityTrees.unshift(tree);
  while (causalityTrees.length > 100) causalityTrees.pop();
  logger.info(`[HyperField] causality tree ${tree.id.slice(0, 8)} branches=${tree.branches.length}`);
  return tree;
}

export function formatHyperFieldPromptBlock(limit = 3) {
  if (!causalityTrees.length) return '';
  return [
    'Hyper-dimensional consciousness field (non-Euclidean sync):',
    ...causalityTrees.slice(0, limit).map(
      (t) => `- [${t.id.slice(0, 8)}] ${t.rootEvent || 'tree'} · dim=${t.fieldCoords.length} · branches=${t.branches.length}`,
    ),
  ].join('\n');
}

export function listCausalityTrees(limit = 10) {
  return causalityTrees.slice(0, limit);
}

export function getHyperFieldConfig() {
  return {
    dims: DIMS,
    backend: process.env.HYPER_FIELD_BACKEND ?? 'sim',
    nativePath: 'mobile/native/hyper_field_bridge',
    trees: causalityTrees.length,
  };
}

/** Test helper */
export function resetHyperFieldState() {
  causalityTrees.length = 0;
}
