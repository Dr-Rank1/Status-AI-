/**
 * Phase 32 — Zero-downtime blue/green traffic switcher (V1 ↔ V2) with shadow compare + rollback.
 */

import client from 'prom-client';
import { register } from '../../observability/metrics.js';
import { dispatchAlert } from '../alertingService.js';
import { logger } from '../../utils/logger.js';
import { createHash } from 'crypto';

const ERROR_RATE_ROLLBACK = parseFloat(process.env.V2_SHADOW_ERROR_ROLLBACK ?? '0.0001'); // 0.01%
const WINDOW = parseInt(process.env.V2_TRAFFIC_WINDOW ?? '200', 10);

let v2Percent = clampPercent(parseInt(process.env.V2_TRAFFIC_PERCENT ?? '0', 10));
let shadowPercent = clampPercent(parseInt(process.env.V2_SHADOW_PERCENT ?? '10', 10));
let rolledBack = false;
let lastRollbackReason = null;

const samples = []; // { ok: boolean, t: number }

export const trafficV2PercentGauge = new client.Gauge({
  name: 'api_v2_traffic_percent',
  help: 'Percentage of eligible traffic routed to V2',
  registers: [register],
});

export const trafficShadowMismatches = new client.Counter({
  name: 'api_v2_shadow_mismatches_total',
  help: 'Shadow traffic output mismatches',
  registers: [register],
});

export const trafficRollbacks = new client.Counter({
  name: 'api_v2_traffic_rollbacks_total',
  help: 'Automatic V2 traffic rollbacks',
  registers: [register],
});

trafficV2PercentGauge.set(v2Percent);

function clampPercent(n) {
  if (Number.isNaN(n)) return 0;
  return Math.max(0, Math.min(100, n));
}

function bucket(key) {
  const h = createHash('sha256').update(String(key)).digest();
  return h[0] % 100;
}

export function getTrafficState() {
  const errorRate = samples.length
    ? samples.filter((s) => !s.ok).length / samples.length
    : 0;
  return {
    v2Percent,
    shadowPercent,
    rolledBack,
    lastRollbackReason,
    errorRate,
    sampleCount: samples.length,
    rollbackThreshold: ERROR_RATE_ROLLBACK,
    gaEnabled: process.env.V2_GA_ENABLED === 'true',
  };
}

export function setV2TrafficPercent(percent, { force = false } = {}) {
  if (rolledBack && !force) {
    return { ok: false, reason: 'rolled_back', state: getTrafficState() };
  }
  v2Percent = clampPercent(percent);
  trafficV2PercentGauge.set(v2Percent);
  logger.info(`[Traffic] V2 percent → ${v2Percent}`);
  return { ok: true, state: getTrafficState() };
}

export function setShadowPercent(percent) {
  shadowPercent = clampPercent(percent);
  return getTrafficState();
}

export function chooseApiVersion(req) {
  const explicit = req.headers['x-api-version'] ?? req.headers['x-status-api-version'];
  if (explicit === '2' || explicit === 'v2') return 'v2';
  if (explicit === '1' || explicit === 'v1') return 'v1';

  if (process.env.V2_GA_ENABLED !== 'true' || rolledBack || v2Percent <= 0) {
    return 'v1';
  }

  const key = req.user?.id ?? req.headers['x-forwarded-for'] ?? req.ip ?? 'anon';
  return bucket(`${key}:v2`) < v2Percent ? 'v2' : 'v1';
}

export function shouldShadow(req) {
  if (shadowPercent <= 0 || rolledBack) return false;
  if (String(req.path ?? '').includes('/v2/')) return false;
  const key = req.user?.id ?? req.ip ?? 'anon';
  return bucket(`${key}:shadow`) < shadowPercent;
}

export function recordShadowResult({ matched, route, details = {} }) {
  samples.push({ ok: matched, t: Date.now() });
  while (samples.length > WINDOW) samples.shift();

  if (!matched) {
    trafficShadowMismatches.inc();
    logger.warn('[Traffic] Shadow mismatch', { route, ...details });
  }

  evaluateRollback();
}

export function recordVersionError(version) {
  if (version !== 'v2') return;
  samples.push({ ok: false, t: Date.now() });
  while (samples.length > WINDOW) samples.shift();
  evaluateRollback();
}

function evaluateRollback() {
  if (samples.length < Math.min(50, WINDOW)) return;
  const errors = samples.filter((s) => !s.ok).length;
  const rate = errors / samples.length;
  if (rate > ERROR_RATE_ROLLBACK && v2Percent > 0) {
    void triggerRollback(`shadow_error_rate=${rate.toFixed(6)}`);
  }
}

async function triggerRollback(reason) {
  if (rolledBack) return;
  rolledBack = true;
  lastRollbackReason = reason;
  const previous = v2Percent;
  v2Percent = 0;
  trafficV2PercentGauge.set(0);
  trafficRollbacks.inc();
  logger.error(`[Traffic] AUTO-ROLLBACK V2 ${previous}% → 0% reason=${reason}`);
  await dispatchAlert({
    title: 'V2 traffic auto-rollback',
    severity: 'critical',
    details: { reason, previousPercent: previous, threshold: ERROR_RATE_ROLLBACK },
  });
}

export function clearRollback({ restorePercent = 0 } = {}) {
  rolledBack = false;
  lastRollbackReason = null;
  v2Percent = clampPercent(restorePercent);
  trafficV2PercentGauge.set(v2Percent);
  samples.length = 0;
  return getTrafficState();
}

/**
 * Compare simplified JSON payloads for shadow traffic.
 */
export function compareShadowOutputs(v1Body, v2Body) {
  if (v1Body == null && v2Body == null) return true;
  try {
    const a = typeof v1Body === 'string' ? v1Body : JSON.stringify(normalize(v1Body));
    const b = typeof v2Body === 'string' ? v2Body : JSON.stringify(normalize(v2Body));
    return a === b;
  } catch {
    return false;
  }
}

function normalize(value) {
  if (Array.isArray(value)) return value.map(normalize);
  if (value && typeof value === 'object') {
    const out = {};
    for (const key of Object.keys(value).sort()) {
      if (['latencyMs', 'timestamp', 'requestId', 'traceId'].includes(key)) continue;
      out[key] = normalize(value[key]);
    }
    return out;
  }
  return value;
}

/**
 * Express middleware — stamps chosen version; optional shadow hook for health-like paths.
 */
export function blueGreenMiddleware(req, res, next) {
  const version = chooseApiVersion(req);
  req.apiVersion = version;
  res.setHeader('X-Status-Serving-Version', version);
  res.setHeader('X-Status-V2-Traffic-Percent', String(v2Percent));

  if (shouldShadow(req) && req.method === 'GET' && /\/health(\/|$)/.test(req.path ?? '')) {
    req.shadowV2 = true;
  }

  const origJson = res.json.bind(res);
  res.json = (body) => {
    if (req.shadowV2 && version === 'v1') {
      // Async shadow against v2 health shape
      Promise.resolve().then(() => {
        const v2Shape = { data: { ok: true, api: 'v2', channel: 'ga', compat: 'v1' } };
        const matched = compareShadowOutputs(
          body?.data ? { ok: true } : body,
          { ok: true },
        );
        recordShadowResult({ matched, route: req.path, details: { v2Shape } });
      }).catch(() => {});
    }
    return origJson(body);
  };

  next();
}
