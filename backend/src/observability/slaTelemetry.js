/**
 * Phase 30 — SLA telemetry: rolling uptime, latency, and AI error/hallucination rates.
 * Targets: 99.9% API uptime, latency SLO, model anomaly spikes → Slack/PagerDuty.
 */

import client from 'prom-client';
import { register } from './metrics.js';
import { dispatchAlert } from '../services/alertingService.js';
import { logger } from '../utils/logger.js';

const WINDOW_MS = parseInt(process.env.SLA_WINDOW_MS ?? String(5 * 60 * 1000), 10);
const UPTIME_TARGET = parseFloat(process.env.SLA_UPTIME_TARGET ?? '0.999');
const LATENCY_P95_MS = parseInt(process.env.SLA_LATENCY_P95_MS ?? '800', 10);
const ERROR_RATE_MAX = parseFloat(process.env.SLA_ERROR_RATE_MAX ?? '0.01');
const HALLUCINATION_RATE_MAX = parseFloat(process.env.SLA_HALLUCINATION_RATE_MAX ?? '0.05');
const ALERT_COOLDOWN_MS = parseInt(process.env.SLA_ALERT_COOLDOWN_MS ?? String(5 * 60 * 1000), 10);

const samples = [];
const aiSamples = [];
const lastAlertAt = new Map();

export const slaUptimeRatio = new client.Gauge({
  name: 'sla_uptime_ratio',
  help: 'Rolling success ratio (non-5xx) over SLA window',
  registers: [register],
});

export const slaLatencyP95Ms = new client.Gauge({
  name: 'sla_latency_p95_ms',
  help: 'Rolling p95 HTTP latency in milliseconds',
  registers: [register],
});

export const slaErrorRate = new client.Gauge({
  name: 'sla_http_error_rate',
  help: 'Rolling 5xx error rate',
  registers: [register],
});

export const slaHallucinationRate = new client.Gauge({
  name: 'sla_ai_hallucination_rate',
  help: 'Rolling AI hallucination anomaly rate',
  registers: [register],
});

export const slaBreachesTotal = new client.Counter({
  name: 'sla_breaches_total',
  help: 'SLA threshold breaches by type',
  labelNames: ['type'],
  registers: [register],
});

function prune(list, now) {
  const cutoff = now - WINDOW_MS;
  while (list.length && list[0].t < cutoff) list.shift();
}

function percentile(sorted, p) {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.ceil(sorted.length * p) - 1);
  return sorted[Math.max(0, idx)];
}

export function recordHttpSample({ statusCode, durationMs, route = '' }) {
  const now = Date.now();
  samples.push({
    t: now,
    ok: statusCode < 500,
    durationMs,
    statusCode,
    route,
  });
  prune(samples, now);
  evaluateHttpSla();
}

export function recordAiAnomalySample({ type, severity = 'warning' }) {
  const now = Date.now();
  aiSamples.push({ t: now, type, severity });
  prune(aiSamples, now);
  evaluateAiSla();
}

export function getSlaSnapshot() {
  const now = Date.now();
  prune(samples, now);
  prune(aiSamples, now);

  const total = samples.length;
  const successes = samples.filter((s) => s.ok).length;
  const uptime = total === 0 ? 1 : successes / total;
  const errorRate = total === 0 ? 0 : 1 - uptime;
  const durations = samples.map((s) => s.durationMs).sort((a, b) => a - b);
  const p95 = percentile(durations, 0.95);

  const aiTotal = aiSamples.length || 1;
  const hallucinations = aiSamples.filter((s) => s.type === 'model_hallucination').length;
  const hallucinationRate = hallucinations / aiTotal;

  return {
    windowMs: WINDOW_MS,
    sampleCount: total,
    uptime,
    uptimeTarget: UPTIME_TARGET,
    errorRate,
    errorRateMax: ERROR_RATE_MAX,
    latencyP95Ms: p95,
    latencyP95TargetMs: LATENCY_P95_MS,
    hallucinationRate,
    hallucinationRateMax: HALLUCINATION_RATE_MAX,
    healthy:
      uptime >= UPTIME_TARGET &&
      errorRate <= ERROR_RATE_MAX &&
      p95 <= LATENCY_P95_MS &&
      hallucinationRate <= HALLUCINATION_RATE_MAX,
  };
}

function evaluateHttpSla() {
  const snap = getSlaSnapshot();
  slaUptimeRatio.set(snap.uptime);
  slaLatencyP95Ms.set(snap.latencyP95Ms);
  slaErrorRate.set(snap.errorRate);

  if (snap.sampleCount < 20) return;

  if (snap.uptime < UPTIME_TARGET) {
    void breach('uptime', 'critical', {
      uptime: snap.uptime,
      target: UPTIME_TARGET,
      samples: snap.sampleCount,
    });
  }

  if (snap.errorRate > ERROR_RATE_MAX) {
    void breach('error_rate', 'critical', {
      errorRate: snap.errorRate,
      max: ERROR_RATE_MAX,
    });
  }

  if (snap.latencyP95Ms > LATENCY_P95_MS) {
    void breach('latency_p95', 'warning', {
      p95Ms: snap.latencyP95Ms,
      targetMs: LATENCY_P95_MS,
    });
  }
}

function evaluateAiSla() {
  const snap = getSlaSnapshot();
  slaHallucinationRate.set(snap.hallucinationRate);

  if (aiSamples.length < 10) return;

  if (snap.hallucinationRate > HALLUCINATION_RATE_MAX) {
    void breach('hallucination_rate', 'warning', {
      rate: snap.hallucinationRate,
      max: HALLUCINATION_RATE_MAX,
    });
  }
}

async function breach(type, severity, details) {
  const last = lastAlertAt.get(type) ?? 0;
  if (Date.now() - last < ALERT_COOLDOWN_MS) return;
  lastAlertAt.set(type, Date.now());
  slaBreachesTotal.inc({ type });

  logger.warn(`[SLA] Breach type=${type}`, details);
  await dispatchAlert({
    title: `SLA breach: ${type}`,
    severity,
    details: { ...details, service: 'status-api', sla: true },
  });
}

/** Test helper — clear rolling windows. */
export function __resetSlaStateForTests() {
  samples.length = 0;
  aiSamples.length = 0;
  lastAlertAt.clear();
}
