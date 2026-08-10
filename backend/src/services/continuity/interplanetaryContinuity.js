/**
 * Phase 42 — Sovereign interplanetary agent continuity protocol.
 * Non-custodial, self-replicating recovery across orbital / ground clusters
 * using molecular cold-storage snapshots.
 */

import crypto from 'crypto';
import { logger } from '../../utils/logger.js';
import { AppError } from '../../utils/errors.js';
import { assertAgentsNotKilled } from '../security/globalKillSwitchService.js';
import { appendAuditEvent } from '../security/immutableAuditLedger.js';
import { archiveToMolecularStorage, retrieveMolecularArchive } from '../storage/molecularDnaEncoder.js';
import { syncViaLeoMesh } from '../network/leoOrbitalMeshRouter.js';

/** Registry of continuity capsules (agent identity → molecular snapshot ids). */
const capsules = new Map();
const healthyClusters = new Map([
  ['ground-primary', { kind: 'ground', healthy: true, capacity: 32 }],
  ['leo-relay', { kind: 'orbital', healthy: true, capacity: 16 }],
  ['gs-atlantic', { kind: 'ground', healthy: true, capacity: 24 }],
]);

/**
 * Snapshot agent state into molecular archive + continuity capsule (non-custodial hash).
 */
export async function createContinuityCapsule({
  agentId,
  characterId = null,
  state = {},
  memoryRecords = [],
} = {}) {
  assertAgentsNotKilled();
  const archive = await archiveToMolecularStorage({
    label: `continuity:${agentId}`,
    records: memoryRecords.length ? memoryRecords : [{ state }],
    metadata: { agentId, characterId, protocol: 'interplanetary-continuity/v1' },
  });

  const capsule = {
    capsuleId: crypto.randomUUID(),
    agentId,
    characterId,
    archiveId: archive.id,
    stateCommitment: crypto
      .createHash('sha256')
      .update(JSON.stringify({ agentId, state, archive: archive.dnaHash }))
      .digest('hex'),
    custodial: false,
    replicas: ['ground-primary', 'leo-relay'],
    createdAt: new Date().toISOString(),
  };
  capsules.set(capsule.capsuleId, capsule);

  await appendAuditEvent({
    type: 'continuity.capsule',
    actor: agentId,
    action: 'create',
    decision: 'archived',
    metadata: { capsuleId: capsule.capsuleId, archiveId: archive.id },
  });

  // Opportunistic LEO replication of commitment (not raw secrets)
  await syncViaLeoMesh({
    edgeNodeId: agentId,
    payload: { capsuleId: capsule.capsuleId, stateCommitment: capsule.stateCommitment },
    connected: process.env.LEO_CONTINUITY_LIVE === 'true',
  }).catch((err) => logger.warn(`[Continuity] LEO replicate skipped: ${err.message}`));

  logger.info(`[Continuity] capsule ${capsule.capsuleId.slice(0, 8)} agent=${agentId}`);
  return { capsule, archive: { id: archive.id, dnaHash: archive.dnaHash, path: archive.path } };
}

/**
 * Mark a cluster unhealthy (regional catastrophe simulation).
 */
export function markClusterHealth(clusterId, healthy) {
  const c = healthyClusters.get(clusterId) ?? { kind: 'ground', capacity: 8 };
  healthyClusters.set(clusterId, { ...c, healthy: Boolean(healthy) });
  return healthyClusters.get(clusterId);
}

/**
 * Re-instantiate a lost agent on a healthy orbital/ground cluster from molecular snapshot.
 */
export async function recoverAgentFromCapsule({
  capsuleId,
  preferredCluster = null,
} = {}) {
  assertAgentsNotKilled();
  const capsule = capsules.get(capsuleId);
  if (!capsule) throw new AppError('Continuity capsule not found', 404, 'CONTINUITY_MISSING');

  const healthy = [...healthyClusters.entries()]
    .filter(([, v]) => v.healthy)
    .sort((a, b) => {
      if (preferredCluster && a[0] === preferredCluster) return -1;
      if (preferredCluster && b[0] === preferredCluster) return 1;
      return (b[1].capacity ?? 0) - (a[1].capacity ?? 0);
    });
  if (!healthy.length) {
    throw new AppError('No healthy clusters for recovery', 503, 'CONTINUITY_NO_CLUSTER');
  }

  const [clusterId, cluster] = healthy[0];
  const retrieved = await retrieveMolecularArchive(capsule.archiveId);
  if (!retrieved.integrityOk) {
    throw new AppError('Molecular snapshot integrity failed', 422, 'CONTINUITY_CORRUPT');
  }

  const node = {
    nodeId: `${capsule.agentId}::${crypto.randomUUID().slice(0, 8)}`,
    agentId: capsule.agentId,
    characterId: capsule.characterId,
    clusterId,
    clusterKind: cluster.kind,
    stateCommitment: capsule.stateCommitment,
    restoredFrom: capsule.archiveId,
    payload: retrieved.payload,
    status: 'reinstated',
    at: new Date().toISOString(),
  };

  await appendAuditEvent({
    type: 'continuity.recover',
    actor: 'continuity-daemon',
    action: 'reinstantiate',
    decision: 'ok',
    metadata: { capsuleId, clusterId, nodeId: node.nodeId },
  });

  logger.info(`[Continuity] recovered ${capsule.agentId} → ${clusterId} (${cluster.kind})`);
  return { node, integrityOk: retrieved.integrityOk, dnaRoundTripOk: retrieved.dnaRoundTripOk };
}

/**
 * Autonomous daemon tick: detect missing agents and recover from capsules.
 */
export async function runContinuityDaemonTick({
  missingAgentIds = [],
} = {}) {
  assertAgentsNotKilled();
  const actions = [];
  for (const agentId of missingAgentIds) {
    const capsule = [...capsules.values()].find((c) => c.agentId === agentId);
    if (!capsule) {
      actions.push({ agentId, status: 'no_capsule' });
      continue;
    }
    try {
      const recovered = await recoverAgentFromCapsule({ capsuleId: capsule.capsuleId });
      actions.push({ agentId, status: 'recovered', nodeId: recovered.node.nodeId });
    } catch (err) {
      actions.push({ agentId, status: 'failed', error: err.message });
    }
  }
  return {
    daemon: 'interplanetary-continuity/v1',
    checked: missingAgentIds.length,
    actions,
    healthyClusters: Object.fromEntries(healthyClusters),
  };
}

export function getContinuityConfig() {
  return {
    capsules: capsules.size,
    clusters: Object.fromEntries(healthyClusters),
    custodial: false,
    selfReplicating: true,
    molecularSnapshots: true,
  };
}

/** Test helper */
export function resetContinuityState() {
  capsules.clear();
  for (const [id, v] of healthyClusters) {
    healthyClusters.set(id, { ...v, healthy: true });
  }
}
