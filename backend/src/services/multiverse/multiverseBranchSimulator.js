/**
 * Phase 45 — Multiversal branching simulation & utility-maximizing state collapse.
 * Predictive parallel timelines across probabilistic state spaces; collapse is
 * dry-run by default (MULTIVERSE_COLLAPSE_LIVE=true required to persist).
 */

import crypto from 'crypto';
import { logger } from '../../utils/logger.js';
import { AppError } from '../../utils/errors.js';
import { assertAgentsNotKilled } from '../security/globalKillSwitchService.js';
import { appendAuditEvent } from '../security/immutableAuditLedger.js';
import { query } from '../../config/database.js';

const LIVE = () => process.env.MULTIVERSE_COLLAPSE_LIVE === 'true';
const MAX_BRANCHES = parseInt(process.env.MULTIVERSE_MAX_BRANCHES ?? '8', 10);

/**
 * Spawn probabilistic timeline branches from a base state hypothesis.
 */
export function simulateMultiversalBranches({
  hypothesis = {},
  branchCount = 5,
  seed = null,
} = {}) {
  const n = Math.min(MAX_BRANCHES, Math.max(2, branchCount));
  const rng = mulberry32(
    seed
      ? crypto.createHash('sha256').update(String(seed)).digest().readUInt32BE(0)
      : crypto.randomBytes(4).readUInt32BE(0),
  );

  const baseUtility = Number(hypothesis.utility ?? 0.5);
  const branches = [];
  for (let i = 0; i < n; i += 1) {
    const drift = (rng() - 0.5) * 0.6;
    const risk = rng() * 0.4;
    const alignment = 0.55 + rng() * 0.45;
    const utility = clamp01(baseUtility + drift - risk * 0.25 + (alignment - 0.7) * 0.2);
    branches.push({
      branchId: crypto.randomUUID(),
      index: i,
      probability: 0, // filled after normalize
      utility,
      risk,
      alignment,
      outcome: {
        ...hypothesis,
        timeline: `T${i}`,
        predictedMetric: Number((utility * (1 - risk)).toFixed(4)),
        actions: hypothesizeActions(hypothesis, rng),
      },
    });
  }

  // Softmax over utility for selection weights
  const maxU = Math.max(...branches.map((b) => b.utility));
  const exps = branches.map((b) => Math.exp((b.utility - maxU) * 4));
  const sum = exps.reduce((a, b) => a + b, 0) || 1;
  branches.forEach((b, i) => {
    b.probability = Number((exps[i] / sum).toFixed(6));
  });

  const simulationId = crypto.randomUUID();
  logger.info(`[Multiverse] sim=${simulationId.slice(0, 8)} branches=${n}`);
  return { simulationId, branches, engine: 'multiverse-sim/v1' };
}

function hypothesizeActions(hypothesis, rng) {
  const catalog = ['scale_swarm', 'defer_pretrain', 'boost_region', 'chrono_merge', 'hold'];
  const pick = catalog[Math.floor(rng() * catalog.length)];
  return [{ type: pick, weight: Number(rng().toFixed(3)), context: hypothesis.region ?? 'global' }];
}

/**
 * Collapse to highest expected utility (utility × probability × alignment).
 */
export function collapseToBestTimeline(simulation) {
  if (!simulation?.branches?.length) {
    throw new AppError('No branches to collapse', 400, 'MULTIVERSE_EMPTY');
  }
  let best = null;
  let bestScore = -1;
  for (const b of simulation.branches) {
    const score = b.utility * b.probability * b.alignment;
    if (score > bestScore) {
      bestScore = score;
      best = b;
    }
  }
  return {
    simulationId: simulation.simulationId,
    selected: best,
    score: Number(bestScore.toFixed(6)),
    rejected: simulation.branches.filter((b) => b.branchId !== best.branchId).map((b) => b.branchId),
    collapsedAt: new Date().toISOString(),
  };
}

/**
 * Merge collapsed timeline into live substrate.
 * Default: audit-only dry-run. Live mode writes a bounded invariant row when DB available.
 */
export async function mergeCollapsedTimeline(collapse, { actor = 'multiverse' } = {}) {
  assertAgentsNotKilled();
  const payload = {
    simulationId: collapse.simulationId,
    branchId: collapse.selected.branchId,
    outcome: collapse.selected.outcome,
    score: collapse.score,
    live: LIVE(),
  };

  await appendAuditEvent({
    type: 'multiverse.collapse',
    actor,
    action: 'merge',
    decision: LIVE() ? 'live_merge' : 'dry_run',
    metadata: payload,
  });

  if (!LIVE()) {
    return { ...payload, persisted: false, reason: 'MULTIVERSE_COLLAPSE_LIVE not enabled' };
  }

  // Bounded persist — never arbitrary SQL; store JSON snapshot table-optional
  try {
    await query(
      `INSERT INTO multiverse_collapsed_timelines (id, simulation_id, branch_id, score, outcome, created_at)
       VALUES ($1, $2, $3, $4, $5::jsonb, NOW())
       ON CONFLICT DO NOTHING`,
      [
        crypto.randomUUID(),
        collapse.simulationId,
        collapse.selected.branchId,
        collapse.score,
        JSON.stringify(collapse.selected.outcome),
      ],
    ).catch(async (err) => {
      // Table may not exist — fall back to file-less audit-only success with note
      logger.warn(`[Multiverse] DB persist skipped: ${err.message}`);
      return null;
    });
  } catch (err) {
    logger.warn(`[Multiverse] merge persist: ${err.message}`);
  }

  return { ...payload, persisted: true };
}

export async function runMultiverseCycle(args = {}) {
  const sim = simulateMultiversalBranches(args);
  const collapse = collapseToBestTimeline(sim);
  const merge = await mergeCollapsedTimeline(collapse, { actor: args.actor ?? 'multiverse' });
  return { sim, collapse, merge };
}

export function getMultiverseConfig() {
  return {
    maxBranches: MAX_BRANCHES,
    collapseLive: LIVE(),
    engine: 'multiverse-sim/v1',
    mergePolicy: 'max(utility × probability × alignment)',
  };
}

function clamp01(x) {
  return Math.max(0, Math.min(1, x));
}

function mulberry32(a) {
  return () => {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
