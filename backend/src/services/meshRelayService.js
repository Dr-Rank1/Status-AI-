/**
 * P2P mesh signaling relay — WebRTC/libp2p-style peer discovery fallback when cloud is down.
 */

import crypto from 'crypto';
import { query } from '../config/database.js';
import { logger } from '../utils/logger.js';

const PEER_TTL_MS = parseInt(process.env.MESH_PEER_TTL_MS ?? '120000', 10);

export async function registerMeshPeer({
  peerId,
  userId = null,
  clusterId,
  capabilities = [],
  metadata = {},
}) {
  const { rows } = await query(
    `INSERT INTO mesh_peer_sessions (peer_id, user_id, cluster_id, capabilities, metadata, last_seen_at)
     VALUES ($1, $2, $3, $4, $5, NOW())
     ON CONFLICT (peer_id) DO UPDATE SET
       cluster_id = EXCLUDED.cluster_id,
       capabilities = EXCLUDED.capabilities,
       metadata = EXCLUDED.metadata,
       last_seen_at = NOW()
     RETURNING id, peer_id, cluster_id, capabilities, last_seen_at`,
    [peerId, userId, clusterId, JSON.stringify(capabilities), JSON.stringify(metadata)],
  );
  return rows[0];
}

export async function listClusterPeers(clusterId) {
  const cutoff = new Date(Date.now() - PEER_TTL_MS).toISOString();
  const { rows } = await query(
    `SELECT peer_id, user_id, capabilities, metadata, last_seen_at
     FROM mesh_peer_sessions
     WHERE cluster_id = $1 AND last_seen_at >= $2
     ORDER BY last_seen_at DESC
     LIMIT 100`,
    [clusterId, cutoff],
  );
  return rows;
}

export async function relaySignal({ fromPeerId, toPeerId, signalType, payload }) {
  logger.debug(`[Mesh] Signal ${signalType}: ${fromPeerId} → ${toPeerId ?? 'broadcast'}`);
  return {
    relayId: crypto.randomUUID(),
    fromPeerId,
    toPeerId,
    signalType,
    payload,
    relayedAt: new Date().toISOString(),
  };
}

export async function recordGossip({
  clusterId,
  recordType,
  recordKey,
  payload,
  originPeerId = null,
}) {
  const payloadHash = crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex');

  await query(
    `INSERT INTO mesh_gossip_records (cluster_id, record_type, record_key, payload_hash, origin_peer_id)
     VALUES ($1, $2, $3, $4, $5)`,
    [clusterId, recordType, recordKey, payloadHash, originPeerId],
  );

  const { rows: existing } = await query(
    `SELECT payload_hash FROM mesh_gossip_records
     WHERE cluster_id = $1 AND record_type = $2 AND record_key = $3
     ORDER BY created_at DESC LIMIT 5`,
    [clusterId, recordType, recordKey],
  );

  return {
    payloadHash,
    consensusHashes: existing.map((r) => r.payload_hash),
    consensusReached: existing.length >= 2 && existing.every((r) => r.payload_hash === payloadHash),
  };
}

export async function getMeshStatus(clusterId) {
  const peers = await listClusterPeers(clusterId);
  const { rows: gossip } = await query(
    `SELECT record_type, COUNT(*)::int AS count
     FROM mesh_gossip_records WHERE cluster_id = $1
     GROUP BY record_type`,
    [clusterId],
  );
  return { clusterId, peerCount: peers.length, peers, gossipRecords: gossip };
}
