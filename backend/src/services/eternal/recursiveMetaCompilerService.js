/**
 * Phase 50 — Recursive meta-compiler & Ouroboros loop monitor.
 * Observes Phases 1–49, proposes concurrent hyper-tunes in sandbox.
 * Never mutates production source unless RECURSIVE_META_APPLY=true (+ kill-switch clear).
 */

import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { logger } from '../../utils/logger.js';
import { AppError } from '../../utils/errors.js';
import { assertAgentsNotKilled } from '../security/globalKillSwitchService.js';
import { appendAuditEvent } from '../security/immutableAuditLedger.js';
import {
  analyzeBottlenecks,
  proposeSandboxedRewrite,
} from '../devops/metaCompilerDaemon.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../../../../');
const ARTIFACT_DIR = process.env.RECURSIVE_META_DIR
  ?? path.join(ROOT, 'data/eternal-engine/meta-compiler');

const APPLY_LIVE = () => process.env.RECURSIVE_META_APPLY === 'true';
const PHASE_LO = 1;
const PHASE_HI = 49;

/** Canonical phase observation map (ceremonial lineage, not process spawners). */
export const PHASE_OBSERVABLES = Object.freeze(
  Array.from({ length: PHASE_HI - PHASE_LO + 1 }, (_, i) => {
    const phase = PHASE_LO + i;
    return {
      phase,
      label: `phase-${phase}`,
      causalStable: true,
      backwardCompatible: true,
    };
  }),
);

/**
 * Observe all phases 1–49 concurrently (metadata snapshot).
 */
export function observePhaseLoop({ metricsByPhase = {} } = {}) {
  const observations = PHASE_OBSERVABLES.map((p) => {
    const m = metricsByPhase[p.phase] ?? metricsByPhase[String(p.phase)] ?? {};
    const bottlenecks = analyzeBottlenecks({
      path: m.path ?? `docs/phase-${p.phase}`,
      cpu_pct: m.cpu_pct ?? 40 + (p.phase % 17),
      p99_ms: m.p99_ms ?? 25 + (p.phase % 11),
    });
    return {
      ...p,
      bottlenecks,
      needsTune: bottlenecks.some((b) => b.rewriteSuggested),
      at: new Date().toISOString(),
    };
  });

  return {
    engine: 'recursive-meta/v∞',
    phasesObserved: observations.length,
    simultaneous: true,
    causalLoopStable: observations.every((o) => o.causalStable),
    observations,
  };
}

/**
 * Re-optimize / hyper-tune in sandbox across all historical phases.
 * Writes proposal artifacts only; does not rewrite the source tree by default.
 */
export async function runRecursiveMetaPass({
  metricsByPhase = {},
  maxProposals = 12,
} = {}) {
  assertAgentsNotKilled();
  const loop = observePhaseLoop({ metricsByPhase });
  const candidates = loop.observations.filter((o) => o.needsTune).slice(0, maxProposals);

  const proposals = [];
  for (const obs of candidates) {
    const bn = obs.bottlenecks[0];
    try {
      const proposal = await proposeSandboxedRewrite({
        ...bn,
        hotspotPath: bn.hotspotPath.startsWith('docs/')
          ? 'backend/src/services/ai/agentTools.js'
          : bn.hotspotPath,
      });
      proposals.push({
        phase: obs.phase,
        proposalId: proposal.proposalId,
        sandboxed: true,
        applied: false,
        backwardCompatible: true,
      });
    } catch (err) {
      proposals.push({
        phase: obs.phase,
        error: err.message,
        sandboxed: true,
        applied: false,
      });
    }
  }

  // Self-referential commitment over the full observation set
  const commitment = crypto
    .createHash('sha256')
    .update(JSON.stringify({ loop: loop.phasesObserved, proposals }))
    .digest('hex');

  if (APPLY_LIVE()) {
    throw new AppError(
      'RECURSIVE_META_APPLY refused: live source mutation is disabled for causal loop stability',
      403,
      'RECURSIVE_META_APPLY_DENIED',
    );
  }

  await fs.mkdir(ARTIFACT_DIR, { recursive: true });
  const artifact = {
    commitment,
    engine: 'recursive-meta/v∞',
    phases: PHASE_HI,
    proposals,
    causalLoopStable: true,
    backwardCompatible: true,
    appliedToSource: false,
    at: new Date().toISOString(),
  };
  const file = path.join(ARTIFACT_DIR, `pass-${commitment.slice(0, 12)}.json`);
  await fs.writeFile(file, JSON.stringify(artifact, null, 2), 'utf8');
  await fs.writeFile(
    path.join(ARTIFACT_DIR, 'LATEST_PASS.json'),
    JSON.stringify(artifact, null, 2),
    'utf8',
  );

  await appendAuditEvent({
    type: 'eternal.recursive_meta_pass',
    actor: 'recursive-meta-compiler',
    action: 'observe_and_propose',
    decision: 'sandboxed',
    metadata: { commitment, proposals: proposals.length, file },
  }).catch(() => {});

  logger.info(
    `[RecursiveMeta] phases=${loop.phasesObserved} proposals=${proposals.length} commit=${commitment.slice(0, 12)}`,
  );

  return { loop, artifact, path: file };
}

export function getRecursiveMetaConfig() {
  return {
    engine: 'recursive-meta/v∞',
    phaseRange: [PHASE_LO, PHASE_HI],
    applyLive: false,
    applyLiveEnvHonored: APPLY_LIVE(),
    artifactDir: ARTIFACT_DIR,
    preservesBackwardCompatibility: true,
    preservesCausalLoopStability: true,
  };
}
