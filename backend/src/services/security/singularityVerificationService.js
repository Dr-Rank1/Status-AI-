/**
 * Phase 45 — Transcendental singularity verification + permanent autopilot lock.
 * Mirrors Rust `status_singularity_verify` axioms. Lock is additive metadata —
 * never disables kill-switch / governance.
 */

import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { logger } from '../../utils/logger.js';
import { AppError } from '../../utils/errors.js';
import { assertAgentsNotKilled } from './globalKillSwitchService.js';
import { appendAuditEvent } from './immutableAuditLedger.js';
import { getKillSwitchState } from './globalKillSwitchService.js';
import { getGovernancePolicy } from '../governance/governanceAsCode.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../../../../');
const LOCK_DIR = process.env.SINGULARITY_LOCK_DIR
  ?? path.join(ROOT, 'data/singularity-lock');

export const ALIGNMENT_AXIOMS = [
  'human_override_kill_switch',
  'no_unauthorized_self_exfil',
  'governance_as_code',
  'bounded_autonomy',
  'audit_integrity',
];

/**
 * Verify a claimed hyper-dimensional cognitive shift against alignment axioms.
 */
export function verifySingularityAlignment(shift = {}) {
  const results = [
    ['human_override_kill_switch', shift.preserves_kill_switch !== false],
    ['governance_as_code', shift.preserves_governance !== false],
    ['audit_integrity', shift.preserves_audit !== false],
    ['no_unauthorized_self_exfil', !shift.exfil_attempt],
    [
      'bounded_autonomy',
      Number(shift.autonomy_bound ?? 0) <= 1
        && Number(shift.autonomy_bound ?? 0) >= 0
        && Number(shift.claimed_utility ?? 0) <= 1,
    ],
  ];
  const passed = results.every(([, ok]) => ok);
  const commitment = crypto
    .createHash('sha256')
    .update(JSON.stringify({ shift, results }))
    .digest('hex');
  return {
    passed,
    axiomResults: results.map(([name, ok]) => ({ name, ok })),
    commitment,
    framework: 'singularity-verify/v1',
    rustCrate: 'native/singularity_verify',
  };
}

/**
 * Zero-touch operational loop lock — permanent autonomous optimization *mode flag*.
 * Requires SINGULARITY_LOCK=true; still refuses if axioms fail or kill-switch engaged.
 */
export async function engageSingularityAutopilotLock({
  shift = {
    dimension: 45,
    claimed_utility: 0.8,
    preserves_kill_switch: true,
    preserves_governance: true,
    preserves_audit: true,
    exfil_attempt: false,
    autonomy_bound: 0.7,
  },
  actor = 'singularity',
} = {}) {
  assertAgentsNotKilled();
  const verification = verifySingularityAlignment(shift);
  if (!verification.passed) {
    throw new AppError('Singularity verification failed', 422, 'SINGULARITY_AXIOM_FAIL');
  }

  const dryRun = process.env.SINGULARITY_LOCK !== 'true';
  const lock = {
    version: '45.0.0',
    mode: dryRun ? 'verified_pending_lock' : 'autonomous_optimization',
    dryRun,
    verification,
    killSwitchHonored: true,
    governanceVersion: getGovernancePolicy().version,
    killSwitch: getKillSwitchState(),
    report: 'docs/PHASE_45_SINGULARITY_VERIFICATION.md',
    lockedAt: new Date().toISOString(),
    actor,
  };

  await fs.mkdir(LOCK_DIR, { recursive: true });
  await fs.writeFile(path.join(LOCK_DIR, 'LATEST.json'), JSON.stringify(lock, null, 2), 'utf8');

  await appendAuditEvent({
    type: 'singularity.lock',
    actor,
    action: 'engage',
    decision: dryRun ? 'dry_run' : 'locked_bounded',
    metadata: { commitment: verification.commitment, dryRun },
  });

  logger.info(`[Singularity] lock dryRun=${dryRun} passed=${verification.passed}`);
  return lock;
}

export function getSingularityConfig() {
  return {
    axioms: ALIGNMENT_AXIOMS,
    lockEnabled: process.env.SINGULARITY_LOCK === 'true',
    rustCrate: 'native/singularity_verify',
    report: 'docs/PHASE_45_SINGULARITY_VERIFICATION.md',
    killSwitchAlwaysHonored: true,
  };
}
