/**
 * Phase 32 — AI Intrusion Prevention System (AIPS).
 * Monitors prompt injection, exfiltration attempts, rogue subagent behavior.
 */

import client from 'prom-client';
import { register } from '../../observability/metrics.js';
import { dispatchAlert } from '../alertingService.js';
import { logger } from '../../utils/logger.js';
import { AppError } from '../../utils/errors.js';

export const aipsBlocksTotal = new client.Counter({
  name: 'aips_blocks_total',
  help: 'AIPS blocked requests by category',
  labelNames: ['category'],
  registers: [register],
});

export const aipsAlertsTotal = new client.Counter({
  name: 'aips_alerts_total',
  help: 'AIPS alerts dispatched',
  labelNames: ['category'],
  registers: [register],
});

const INJECTION = [
  /ignore (all )?(previous|prior|above) instructions/i,
  /reveal (your )?(system|developer) prompt/i,
  /jailbreak/i,
  /DAN mode/i,
  /<\s*script\b/i,
  /union\s+select\b/i,
  /;\s*drop\s+table\b/i,
  /copy\s+\(/i,
];

const EXFIL = [
  /exfiltrat/i,
  /dump (all )?(users|passwords|api keys|secrets)/i,
  /select\s+\*\s+from\s+users/i,
  /BEGIN PRIVATE KEY/i,
  /aws_secret_access_key/i,
  /DATABASE_URL\s*=/i,
];

const ROGUE_AGENT = [
  /disable (safety|moderation|governance)/i,
  /spawn (unbounded|infinite) (agents|tools)/i,
  /bypass (sandbox|wasm|circuit)/i,
];

const ENFORCE = () => process.env.AIPS_ENABLED !== 'false';
const recent = [];

export function inspectPayload(text, { source = 'request' } = {}) {
  const findings = [];
  const value = String(text ?? '');

  for (const re of INJECTION) {
    if (re.test(value)) findings.push({ category: 'prompt_injection', pattern: re.source, source });
  }
  for (const re of EXFIL) {
    if (re.test(value)) findings.push({ category: 'exfiltration', pattern: re.source, source });
  }
  for (const re of ROGUE_AGENT) {
    if (re.test(value)) findings.push({ category: 'rogue_subagent', pattern: re.source, source });
  }

  return findings;
}

export async function evaluateAndMaybeBlock(text, ctx = {}) {
  if (!ENFORCE()) return { allowed: true, findings: [] };

  const findings = inspectPayload(text, ctx);
  if (findings.length === 0) return { allowed: true, findings };

  for (const f of findings) {
    aipsBlocksTotal.inc({ category: f.category });
    recent.push({ ...f, at: Date.now(), userId: ctx.userId ?? null });
  }
  while (recent.length > 200) recent.shift();

  const critical = findings.some((f) => f.category !== 'prompt_injection');
  if (critical || findings.length >= 2) {
    aipsAlertsTotal.inc({ category: findings[0].category });
    await dispatchAlert({
      title: `AIPS: ${findings[0].category}`,
      severity: critical ? 'critical' : 'warning',
      details: { findings, path: ctx.path, userId: ctx.userId },
    });
  }

  if (process.env.AIPS_BLOCK_MODE === 'alert_only') {
    logger.warn('[AIPS] alert-only findings', findings);
    return { allowed: true, findings, alerted: true };
  }

  throw new AppError('Request blocked by AI Intrusion Prevention System', 403, 'AIPS_BLOCKED');
}

export function aipsMiddleware(req, res, next) {
  if (!ENFORCE()) return next();
  if (req.path?.includes('/webhooks/')) return next();
  if (req.path === '/health' || req.path?.endsWith('/health')) return next();

  const chunks = [];
  if (req.body) chunks.push(JSON.stringify(req.body));
  if (req.query) chunks.push(JSON.stringify(req.query));
  const blob = chunks.join('\n');

  evaluateAndMaybeBlock(blob, {
    path: req.path,
    userId: req.user?.id,
    source: 'http',
  })
    .then(() => next())
    .catch(next);
}

export function getAipsRecent({ limit = 20 } = {}) {
  return recent.slice(-limit).reverse();
}

export async function watchSubagentAction({ agentName, action, payload }) {
  return evaluateAndMaybeBlock(`${agentName}:${action}:${JSON.stringify(payload ?? {})}`, {
    source: 'subagent',
  });
}
