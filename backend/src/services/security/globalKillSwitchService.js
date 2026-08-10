/**
 * Phase 38 — Global kill switch for the agentic workforce.
 * Halts swarm activity, freezes escrow, blocks new autonomous runs.
 */

import { logger } from '../../utils/logger.js';
import { AppError } from '../../utils/errors.js';
import { appendAuditEvent } from './immutableAuditLedger.js';

let killed = process.env.AGENT_KILL_SWITCH === 'true';
let reason = killed ? 'env_AGENT_KILL_SWITCH' : null;
let killedAt = killed ? new Date().toISOString() : null;
let killedBy = killed ? 'env' : null;

export function getKillSwitchState() {
  return {
    killed,
    reason,
    killedAt,
    killedBy,
    escrowFrozen: killed,
    agentsHalted: killed,
  };
}

export function assertAgentsNotKilled() {
  if (killed) {
    throw new AppError(
      `Global kill switch active: ${reason ?? 'halted'}`,
      503,
      'AGENT_KILL_SWITCH',
    );
  }
}

export async function engageKillSwitch({
  by = 'admin',
  reason: why = 'security_anomaly',
  userId = null,
} = {}) {
  killed = true;
  reason = why;
  killedAt = new Date().toISOString();
  killedBy = by;
  logger.error(`[KillSwitch] ENGAGED by=${by} reason=${why}`);

  await appendAuditEvent({
    type: 'kill_switch.engage',
    actor: by,
    action: 'global_halt',
    decision: 'killed',
    metadata: { reason: why },
    userId,
  });

  // Best-effort: freeze open escrows
  try {
    const { query } = await import('../../config/database.js');
    await query(
      `UPDATE agent_escrows SET status = 'frozen', updated_at = NOW()
       WHERE status = 'locked'`,
    );
  } catch (err) {
    logger.warn(`[KillSwitch] escrow freeze skipped: ${err.message}`);
  }

  return getKillSwitchState();
}

export async function releaseKillSwitch({
  by = 'admin',
  userId = null,
} = {}) {
  killed = false;
  reason = null;
  killedAt = null;
  killedBy = null;
  logger.warn(`[KillSwitch] RELEASED by=${by}`);

  await appendAuditEvent({
    type: 'kill_switch.release',
    actor: by,
    action: 'global_resume',
    decision: 'released',
    metadata: {},
    userId,
  });

  try {
    const { query } = await import('../../config/database.js');
    await query(
      `UPDATE agent_escrows SET status = 'locked', updated_at = NOW()
       WHERE status = 'frozen'`,
    );
  } catch (err) {
    logger.warn(`[KillSwitch] escrow unfreeze skipped: ${err.message}`);
  }

  return getKillSwitchState();
}
