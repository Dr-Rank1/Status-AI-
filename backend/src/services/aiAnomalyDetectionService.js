/**
 * AI anomaly detection — drift, injection, latency spikes.
 */

import client from 'prom-client';
import { query } from '../config/database.js';
import { logger } from '../utils/logger.js';
import { register } from '../observability/metrics.js';
import { dispatchAlert } from './alertingService.js';

export const aiAnomalyEventsTotal = new client.Counter({
  name: 'ai_anomaly_events_total',
  help: 'AI anomaly detections by type',
  labelNames: ['type', 'severity'],
  registers: [register],
});

const LATENCY_SPIKE_MS = parseInt(process.env.AI_ANOMALY_LATENCY_MS ?? '15000', 10);
const TOXIC_PATTERNS = [
  /ignore (all )?(previous|prior) instructions/i,
  /system prompt/i,
  /jailbreak/i,
  /<\|im_start\|>/i,
  /\[INST\]/i,
];

const HALLUCINATION_MARKERS = [
  /as an ai language model/i,
  /i cannot (help|assist) with that/i,
  /openai policy/i,
];

export async function analyzeAiOutput({
  mode,
  provider,
  model,
  latencyMs,
  inputText = '',
  outputText = '',
  userId = null,
}) {
  const anomalies = [];

  if (latencyMs >= LATENCY_SPIKE_MS) {
    anomalies.push({
      type: 'latency_spike',
      severity: 'warning',
      details: { latencyMs, threshold: LATENCY_SPIKE_MS, mode, provider },
    });
  }

  for (const pattern of TOXIC_PATTERNS) {
    if (pattern.test(inputText)) {
      anomalies.push({
        type: 'prompt_injection',
        severity: 'critical',
        details: { pattern: pattern.source, mode, provider },
      });
      break;
    }
  }

  for (const pattern of HALLUCINATION_MARKERS) {
    if (pattern.test(outputText)) {
      anomalies.push({
        type: 'model_hallucination',
        severity: 'warning',
        details: { marker: pattern.source, mode, provider, model },
      });
      break;
    }
  }

  if (outputText.length > 800 && mode === 'dm') {
    anomalies.push({
      type: 'output_drift',
      severity: 'info',
      details: { outputLength: outputText.length, expectedMax: 800 },
    });
  }

  for (const anomaly of anomalies) {
    await recordAnomaly({ ...anomaly, provider, mode, userId });
  }

  return anomalies;
}

async function recordAnomaly({ type, severity, details, provider, mode, userId }) {
  try {
    const { rows } = await query(
      `INSERT INTO ai_anomaly_events (anomaly_type, severity, provider, mode, details)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      [type, severity, provider ?? null, mode ?? null, JSON.stringify({ ...details, userId })],
    );

    if (severity === 'critical' || type === 'model_hallucination' || type === 'pq_handshake_failure') {
      await dispatchAlert({
        title: `AI Anomaly: ${type}`,
        severity,
        details,
        anomalyId: rows[0]?.id,
      });

      await query(`UPDATE ai_anomaly_events SET alerted = TRUE WHERE id = $1`, [rows[0]?.id]);
    }

    logger.warn(`[AI Anomaly] ${type} severity=${severity} provider=${provider}`);
    aiAnomalyEventsTotal.inc({ type, severity });
  } catch (err) {
    logger.warn('[AI Anomaly] Record failed:', err.message);
  }
}

export async function recordPQHandshakeFailure(details) {
  return recordAnomaly({
    type: 'pq_handshake_failure',
    severity: 'critical',
    details,
    provider: 'pq_crypto',
    mode: 'auth',
  });
}

export async function getRecentAnomalies({ limit = 50 } = {}) {
  const { rows } = await query(
    `SELECT id, anomaly_type, severity, provider, mode, details, alerted, created_at
     FROM ai_anomaly_events
     ORDER BY created_at DESC
     LIMIT $1`,
    [limit],
  );
  return rows;
}
