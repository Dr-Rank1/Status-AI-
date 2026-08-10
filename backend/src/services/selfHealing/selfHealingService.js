/**
 * Autonomous self-healing orchestrator — log inspection, sandbox, hot-apply.
 */

import { query } from '../../config/database.js';
import { logger } from '../../utils/logger.js';
import { dispatchAlert } from '../alertingService.js';
import { fingerprintError, generatePatchProposal, buildTestCasesForPatch } from './selfHealingPatchEngine.js';
import { evaluatePatchInSandbox } from './selfHealingSandbox.js';
import { registerFallbackPatch, getActivePatches } from './selfHealingRegistry.js';

const ENABLED = process.env.SELF_HEALING_ENABLED !== 'false';
const AUTO_APPLY = process.env.SELF_HEALING_AUTO_APPLY !== 'false';
const MAX_RING = parseInt(process.env.SELF_HEALING_RING_SIZE ?? '200', 10);

const errorRing = [];

export function isSelfHealingEnabled() {
  return ENABLED;
}

export function recordRuntimeError(err, req = null) {
  if (!ENABLED) return null;

  const event = {
    errorFingerprint: fingerprintError(err, req),
    errorType: err.code ?? err.name ?? 'RuntimeError',
    routePattern: req?.originalUrl?.split('?')[0] ?? req?.path ?? null,
    message: (err.message ?? '').slice(0, 500),
    stackPreview: (err.stack ?? '').split('\n').slice(0, 4).join('\n'),
    status: 'detected',
    createdAt: new Date().toISOString(),
  };

  errorRing.unshift(event);
  if (errorRing.length > MAX_RING) errorRing.pop();

  persistEvent(event).catch((e) => {
    logger.debug('[SelfHealing] Event persist skipped:', e.message);
  });

  return event;
}

export function recordPayloadShift(req, details) {
  if (!ENABLED) return null;

  const err = {
    name: 'PayloadShapeError',
    code: 'PayloadShapeError',
    message: details.message ?? 'Unexpected API payload shape',
  };
  return recordRuntimeError(err, req);
}

export function getRecentErrors(limit = 50) {
  return errorRing.slice(0, limit);
}

export async function inspectAndHeal() {
  if (!ENABLED) {
    return { skipped: true, reason: 'disabled' };
  }

  const clusters = clusterErrors(errorRing);
  const results = [];

  for (const cluster of clusters) {
    const representative = cluster.events[0];
    const existing = await findAppliedPatch(representative.errorFingerprint);
    if (existing) {
      results.push({ fingerprint: representative.errorFingerprint, action: 'already_patched', patchId: existing.id });
      continue;
    }

    const proposal = await generatePatchProposal(representative);
    const testCases = buildTestCasesForPatch(proposal);
    const sandbox = await evaluatePatchInSandbox(proposal, testCases);

    const patchRow = await savePatchProposal(proposal, sandbox);

    if (sandbox.passed && AUTO_APPLY) {
      const applied = await applyPatch(patchRow.id);
      results.push({ fingerprint: representative.errorFingerprint, action: 'applied', patchId: applied.id, sandbox });
    } else {
      results.push({ fingerprint: representative.errorFingerprint, action: 'pending', patchId: patchRow.id, sandbox });
    }
  }

  return { inspected: clusters.length, results, activePatches: getActivePatches().length };
}

export async function applyPatch(patchId) {
  const { rows } = await query(
    `UPDATE self_healing_patches
     SET status = 'applied', applied_at = NOW(), test_passed = TRUE
     WHERE id = $1
     RETURNING id, route_pattern, patch_type, patch_config`,
    [patchId],
  );

  if (!rows[0]) {
    throw new Error(`Patch ${patchId} not found`);
  }

  const patch = {
    id: rows[0].id,
    routePattern: rows[0].route_pattern,
    patchType: rows[0].patch_type,
    patchConfig: rows[0].patch_config,
  };

  registerFallbackPatch(patch);

  await query(
    `UPDATE self_healing_events SET status = 'resolved', resolved_at = NOW(), patch_id = $1
     WHERE patch_id IS NULL AND route_pattern = $2`,
    [patchId, patch.routePattern],
  );

  await dispatchAlert({
    severity: 'info',
    title: 'Self-healing patch applied',
    message: `Hot-fix active for ${patch.routePattern}`,
    tags: ['self-healing', patch.patchType],
  }).catch(() => {});

  return patch;
}

export async function getSelfHealingStatus() {
  let dbStats = { events: 0, patches: 0, applied: 0 };
  try {
    const { rows } = await query(
      `SELECT
         (SELECT COUNT(*)::int FROM self_healing_events) AS events,
         (SELECT COUNT(*)::int FROM self_healing_patches) AS patches,
         (SELECT COUNT(*)::int FROM self_healing_patches WHERE status = 'applied') AS applied`,
    );
    dbStats = rows[0] ?? dbStats;
  } catch {
    // DB optional in dev
  }

  return {
    enabled: ENABLED,
    autoApply: AUTO_APPLY,
    ringBufferSize: errorRing.length,
    activeHotFixes: getActivePatches(),
    ...dbStats,
  };
}

function clusterErrors(events) {
  const map = new Map();
  for (const event of events) {
    const key = event.errorFingerprint;
    if (!map.has(key)) {
      map.set(key, { fingerprint: key, events: [] });
    }
    map.get(key).events.push(event);
  }
  return [...map.values()].filter((c) => c.events.length >= 1);
}

async function persistEvent(event) {
  await query(
    `INSERT INTO self_healing_events (error_fingerprint, error_type, route_pattern, message, stack_preview, status)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [event.errorFingerprint, event.errorType, event.routePattern, event.message, event.stackPreview, event.status],
  );
}

async function savePatchProposal(proposal, sandbox) {
  const { rows } = await query(
    `INSERT INTO self_healing_patches (route_pattern, patch_type, patch_config, status, test_passed)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id`,
    [
      proposal.routePattern,
      proposal.patchType,
      JSON.stringify(proposal.patchConfig),
      sandbox.passed ? 'validated' : 'pending',
      sandbox.passed,
    ],
  );

  await query(
    `UPDATE self_healing_events SET patch_id = $1, sandbox_result = $2::jsonb, status = $3
     WHERE error_fingerprint = $4 AND patch_id IS NULL`,
    [rows[0].id, JSON.stringify(sandbox), sandbox.passed ? 'validated' : 'pending', proposal.errorFingerprint],
  );

  return { id: rows[0].id, ...proposal };
}

async function findAppliedPatch(fingerprint) {
  const { rows } = await query(
    `SELECT p.id, p.route_pattern, p.patch_type, p.patch_config
     FROM self_healing_patches p
     JOIN self_healing_events e ON e.patch_id = p.id
     WHERE e.error_fingerprint = $1 AND p.status = 'applied'
     LIMIT 1`,
    [fingerprint],
  );
  return rows[0] ?? null;
}
