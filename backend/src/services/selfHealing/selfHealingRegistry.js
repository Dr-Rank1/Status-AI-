/**
 * Dynamic fallback route registry — hot-applied patches without process restart.
 */

import { logger } from '../../utils/logger.js';

const activePatches = new Map();

export function getActivePatches() {
  return [...activePatches.values()];
}

export function getPatchForRoute(routePath) {
  const normalized = normalizePath(routePath);
  for (const patch of activePatches.values()) {
    if (routeMatches(normalized, patch.routePattern)) {
      return patch;
    }
  }
  return null;
}

export function registerFallbackPatch(patch) {
  activePatches.set(patch.id, {
    ...patch,
    appliedAt: new Date().toISOString(),
  });
  logger.info(`[SelfHealing] Hot-applied patch ${patch.id} → ${patch.routePattern}`);
  return patch;
}

export function revokePatch(patchId) {
  const removed = activePatches.delete(patchId);
  if (removed) {
    logger.info(`[SelfHealing] Revoked patch ${patchId}`);
  }
  return removed;
}

export function selfHealingFallbackMiddleware(req, res, next) {
  const patch = getPatchForRoute(req.originalUrl ?? req.path);
  if (!patch) return next();

  if (patch.patchType === 'fallback_response') {
    const status = patch.patchConfig?.status ?? 200;
    const body = patch.patchConfig?.body ?? { degraded: true };
    res.set('X-Status-Self-Healing', patch.id);
    return res.status(status).json(body);
  }

  if (patch.patchType === 'queue_retry') {
    const retryAfter = patch.patchConfig?.retryAfterSec ?? 30;
    res.set('Retry-After', String(retryAfter));
    res.set('X-Status-Self-Healing', patch.id);
    return res.status(503).json({
      error: 'SELF_HEALING_RETRY',
      message: 'Request queued for retry — temporary degradation.',
      retryAfter,
      degraded: true,
    });
  }

  return next();
}

function normalizePath(path) {
  return String(path ?? '').split('?')[0].replace(/\/[0-9a-f-]{36}/gi, '/:id');
}

function routeMatches(actual, pattern) {
  if (!pattern) return false;
  const a = normalizePath(actual);
  const p = normalizePath(pattern);
  if (a === p) return true;
  const aParts = a.split('/').filter(Boolean);
  const pParts = p.split('/').filter(Boolean);
  if (aParts.length !== pParts.length) return false;
  return pParts.every((part, i) => part === ':id' || part === aParts[i]);
}
