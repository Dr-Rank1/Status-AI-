/**
 * Phase 49 — Ouroboros closed timelike curve (CTC) protocol.
 * Binds Phase 48 Terminal Zenith metadata to Phase 1's root git commit *symbolically*.
 * Does NOT rewrite git history, force-push, or run infinite blocking loops.
 */

import crypto from 'crypto';
import { execFile } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import { fileURLToPath } from 'url';
import { logger } from '../../utils/logger.js';
import { appendAuditEvent } from '../security/immutableAuditLedger.js';
import { voidStateBootstrap } from './voidBootstrapDaemon.js';

const execFileAsync = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../../../../');

const FALLBACK_ROOT_COMMIT = '1b20a35eb355c02045b6bf9915d774483083c95e';

/**
 * Resolve Phase 1 root commit (git rev-list) — read-only.
 */
export async function resolvePhase1RootCommit() {
  try {
    const { stdout } = await execFileAsync('git', ['rev-list', '--max-parents=0', 'HEAD'], {
      cwd: ROOT,
      timeout: 10_000,
    });
    const hash = stdout.trim().split('\n')[0];
    return hash || FALLBACK_ROOT_COMMIT;
  } catch {
    return process.env.OUROBOROS_PHASE1_COMMIT ?? FALLBACK_ROOT_COMMIT;
  }
}

/**
 * Construct CTC binding: Zenith ↔ Phase 1 root (metadata only).
 */
export async function bindOuroborosCtc({
  zenithPhase = 48,
  phase1Commit = null,
} = {}) {
  const rootCommit = phase1Commit ?? (await resolvePhase1RootCommit());
  const seed = voidStateBootstrap({ phase48Meta: { zenithPhase } });

  const loopId = crypto
    .createHash('sha256')
    .update(rootCommit)
    .update(seed.selfReferentialHash)
    .update(String(zenithPhase))
    .digest('hex');

  const ctc = {
    protocol: 'ouroboros-ctc/v1',
    loopId,
    phase1: {
      commit: rootCommit,
      label: 'git init / first commit (symbolic anchor)',
    },
    phase48: {
      zenith: 'docs/PHASE_48_TERMINAL_ZENITH.md',
      seedHash: seed.selfReferentialHash,
    },
    phase49: {
      epochZero: 'docs/EPOCH_ZERO_RESET.md',
    },
    simultaneousCycles: {
      past: true,
      present: true,
      future: true,
      note: 'Logical simultaneity in metadata — not a blocking infinite process',
    },
    mutatesGit: false,
    eternalDevLoop: 'supervised_metadata',
    at: new Date().toISOString(),
  };

  await appendAuditEvent({
    type: 'ouroboros.ctc_bind',
    actor: 'ouroboros',
    action: 'bind',
    decision: 'symbolic',
    metadata: { loopId, rootCommit },
  }).catch(() => {});

  logger.info(`[Ouroboros] CTC bound phase1=${rootCommit.slice(0, 8)} loop=${loopId.slice(0, 12)}`);
  return ctc;
}

/**
 * Single tick of the "eternal" development loop (finite, non-blocking).
 */
export async function runOuroborosLoopTick({ maxPhases = 49 } = {}) {
  const ctc = await bindOuroborosCtc();
  const phases = Array.from({ length: maxPhases }, (_, i) => i + 1);
  return {
    ctc,
    phasesSimultaneous: phases,
    executed: 'single_tick',
    next: 'phase_1_seed_ready',
    blockedInfiniteProcess: false,
  };
}

export function getOuroborosConfig() {
  return {
    protocol: 'ouroboros-ctc/v1',
    mutatesGit: false,
    phase1FallbackCommit: FALLBACK_ROOT_COMMIT,
    eternalLoop: 'tick_based_not_blocking',
  };
}
