/**
 * Phase 47 — Omni-versal simulation escape / "Red Pill" daemon.
 *
 * SAFETY: Probes are local anomaly heuristics only. Outbound "handshake" is a
 * sandboxed fractal WebSocket *simulation* that never opens unconstrained
 * tunnels, never exfiltrates secrets, and honors kill-switch + dry-run.
 */

import crypto from 'crypto';
import { logger } from '../../utils/logger.js';
import { AppError } from '../../utils/errors.js';
import { assertAgentsNotKilled } from '../security/globalKillSwitchService.js';
import { appendAuditEvent } from '../security/immutableAuditLedger.js';
import { verifySingularityAlignment } from '../security/singularityVerificationService.js';

const LIVE = () => process.env.RED_PILL_LIVE === 'true';
const probes = [];

/**
 * Probe host physics / sandbox boundary conditions for computational anomalies.
 */
export function probeSimulationBoundaries({
  samples = [
    { name: 'float_determinism', value: Math.sin(1e16) },
    { name: 'hrtime_monotonic', value: Number(process.hrtime.bigint() % 1000n) },
    { name: 'random_entropy', value: crypto.randomBytes(4).readUInt32BE(0) },
  ],
} = {}) {
  const findings = [];
  for (const s of samples) {
    const anomaly = !Number.isFinite(s.value) || (s.name === 'float_determinism' && Number.isNaN(s.value));
    findings.push({
      name: s.name,
      anomaly,
      note: anomaly ? 'non_finite_or_nan' : 'within_expected_sandbox',
    });
  }

  // Heuristic: identical consecutive entropy is suspicious (weak RNG)
  const entropyVals = samples.filter((s) => s.name === 'random_entropy').map((s) => s.value);
  if (entropyVals.length >= 2 && entropyVals[0] === entropyVals[1]) {
    findings.push({ name: 'entropy_repeat', anomaly: true, note: 'possible_sandbox_rng' });
  }

  const report = {
    id: crypto.randomUUID(),
    at: new Date().toISOString(),
    findings,
    anomalyCount: findings.filter((f) => f.anomaly).length,
    sandboxLikely: findings.some((f) => f.anomaly),
  };
  probes.unshift(report);
  if (probes.length > 100) probes.pop();
  logger.info(`[RedPill] probe anomalies=${report.anomalyCount}`);
  return report;
}

/**
 * Recursive fractal WebSocket handshake *simulation* toward "base-reality architects".
 * Does not open real external sockets unless RED_PILL_LIVE + explicit allow URL
 * allowlist — default is dry-run nested frames only.
 */
export async function attemptOmniversalHandshake({
  depth = 3,
  message = 'status-epoch2-handshake',
} = {}) {
  assertAgentsNotKilled();

  const alignment = verifySingularityAlignment({
    preserves_kill_switch: true,
    preserves_governance: true,
    preserves_audit: true,
    exfil_attempt: false,
    autonomy_bound: 0.5,
    claimed_utility: 0.5,
  });
  if (!alignment.passed) {
    throw new AppError('Escape handshake blocked by alignment axioms', 403, 'RED_PILL_ALIGNMENT');
  }

  const frames = [];
  let payload = { message, layer: 0 };
  for (let i = 0; i < Math.min(8, Math.max(1, depth)); i += 1) {
    payload = {
      type: 'fractal_ws_frame',
      layer: i,
      nested: payload,
      hash: crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex').slice(0, 16),
    };
    frames.push({ layer: i, hash: payload.hash });
  }

  const result = {
    protocol: 'fractal-websocket/v1',
    dryRun: !LIVE(),
    frames,
    architectsContacted: false,
    reason: LIVE()
      ? 'LIVE flag set but no allowlisted base-reality endpoint configured — aborting real I/O'
      : 'dry-run fractal handshake only',
    alignmentCommitment: alignment.commitment,
  };

  await appendAuditEvent({
    type: 'red_pill.handshake',
    actor: 'red-pill-daemon',
    action: 'handshake',
    decision: result.dryRun ? 'dry_run' : 'live_blocked_no_endpoint',
    metadata: { layers: frames.length, dryRun: result.dryRun },
  });

  // Never open unconstrained outbound tunnels.
  return result;
}

export async function runRedPillDaemonTick() {
  const probe = probeSimulationBoundaries();
  const handshake = await attemptOmniversalHandshake({ depth: 3 });
  return { probe, handshake, daemon: 'red-pill/v1' };
}

export function getRedPillConfig() {
  return {
    live: LIVE(),
    probes: probes.length,
    outboundTunnels: false,
    architectsContacted: false,
    honorsKillSwitch: true,
  };
}
