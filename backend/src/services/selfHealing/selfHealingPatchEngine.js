/**
 * Generates fallback patches from runtime error fingerprints and payload shifts.
 */

import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { logger } from '../../utils/logger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = process.env.SELF_HEALING_CONFIG
  ?? path.join(__dirname, '../../../../deploy/self-healing/daemon.config.json');

const KNOWN_FALLBACKS = {
  '/api/v1/posts': {
    patchType: 'fallback_response',
    patchConfig: {
      status: 200,
      body: { data: [], meta: { degraded: true, reason: 'self_healing_feed_fallback' } },
    },
  },
  '/api/v1/spatial/react': {
    patchType: 'fallback_response',
    patchConfig: {
      status: 200,
      body: {
        data: {
          reply: "I'm still here — reconnecting my spatial context.",
          degraded: true,
        },
      },
    },
  },
  '/api/v1/messages': {
    patchType: 'queue_retry',
    patchConfig: { retryAfterSec: 30, maxRetries: 2 },
  },
};

export function fingerprintError(err, req = null) {
  const route = req?.originalUrl?.split('?')[0] ?? req?.path ?? 'unknown';
  const type = err.code ?? err.name ?? 'RuntimeError';
  const message = (err.message ?? '').slice(0, 120);
  const raw = `${type}:${route}:${message}`;
  return crypto.createHash('sha256').update(raw).digest('hex').slice(0, 16);
}

export async function generatePatchProposal(event) {
  const routePattern = normalizeRoute(event.routePattern ?? event.route ?? '/api/v1/unknown');
  const rule = await matchConfigRule(event);
  const known = KNOWN_FALLBACKS[routePattern];

  const proposal = rule ?? known ?? {
    patchType: 'fallback_response',
    patchConfig: {
      status: 503,
      body: {
        error: 'SERVICE_DEGRADED',
        message: 'Temporary fallback while self-healing evaluates a fix.',
        degraded: true,
      },
    },
  };

  return {
    routePattern,
    patchType: proposal.patchType,
    patchConfig: proposal.config ?? proposal.patchConfig,
    errorFingerprint: event.errorFingerprint,
    errorType: event.errorType,
  };
}

export function buildTestCasesForPatch(patch) {
  if (patch.patchType === 'fallback_response') {
    const body = patch.patchConfig?.body ?? {};
    const expectedKeys = body.data !== undefined ? ['data'] : Object.keys(body).slice(0, 3);
    return [{ name: 'fallback_shape', method: 'GET', expectedKeys }];
  }
  if (patch.patchType === 'queue_retry') {
    return [{ name: 'retry_bounds', method: 'POST', expectedKeys: [] }];
  }
  return [];
}

async function matchConfigRule(event) {
  try {
    const raw = await fs.readFile(CONFIG_PATH, 'utf8');
    const config = JSON.parse(raw);
    const rules = config.patchRules ?? [];
    for (const rule of rules) {
      const m = rule.match ?? {};
      if (m.errorType && m.errorType !== event.errorType) continue;
      if (m.routePattern && !String(event.routePattern ?? '').includes(m.routePattern.replace('/api/v1', ''))) {
        continue;
      }
      return { patchType: rule.patchType, config: rule.config };
    }
  } catch (err) {
    logger.debug('[SelfHealing] Config load skipped:', err.message);
  }
  return null;
}

function normalizeRoute(route) {
  if (!route || route === 'unknown') return '/api/v1/unknown';
  const base = route.split('?')[0];
  if (base.startsWith('/api/v1')) return base.replace(/\/[0-9a-f-]{36}/gi, '/:id');
  return `/api/v1${base.startsWith('/') ? '' : '/'}${base}`.replace(/\/[0-9a-f-]{36}/gi, '/:id');
}
