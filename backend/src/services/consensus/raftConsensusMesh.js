/**
 * Phase 36 — Planetary consensus mesh (Raft-over-WebRTC abstraction).
 * Lightweight leader election + log replication for micro-inference node state.
 */

import crypto from 'crypto';
import { logger } from '../../utils/logger.js';
import { getIO } from '../socketService.js';

const nodes = new Map();
const logs = [];
let term = 0;
let votedFor = null;
let commitIndex = 0;
let role = 'follower'; // follower | candidate | leader
let leaderId = null;
const nodeId = process.env.CONSENSUS_NODE_ID ?? `node-${crypto.randomBytes(3).toString('hex')}`;

export function getConsensusConfig() {
  return {
    protocol: 'raft-webrtc',
    nodeId,
    role,
    term,
    leaderId,
    commitIndex,
    peers: [...nodes.keys()],
    quorumSize: parseInt(process.env.CONSENSUS_QUORUM_SIZE ?? '3', 10),
    region: process.env.CONSENSUS_REGION ?? 'local',
  };
}

export function registerPeer({ peerId, region = 'unknown', webrtcEndpoint = null, weight = 1 }) {
  nodes.set(peerId, {
    peerId,
    region,
    webrtcEndpoint,
    weight,
    lastHeartbeat: Date.now(),
  });
  broadcastConsensus('peer_join', { peerId, region });
  return getConsensusConfig();
}

export function heartbeat(peerId) {
  const peer = nodes.get(peerId);
  if (peer) peer.lastHeartbeat = Date.now();
  if (role === 'leader') {
    broadcastConsensus('append_entries', {
      term,
      leaderId: nodeId,
      commitIndex,
      entries: [],
    });
  }
  return { ok: true, role, term };
}

/**
 * Propose a state entry (e.g. edge capacity, traffic shift). Replicated when leader.
 */
export function proposeEntry(command) {
  const entry = {
    index: logs.length + 1,
    term,
    command,
    at: Date.now(),
    id: crypto.randomUUID(),
  };

  if (role !== 'leader') {
    return { accepted: false, reason: 'not_leader', leaderId, entry };
  }

  logs.push(entry);
  commitIndex = entry.index;
  broadcastConsensus('append_entries', {
    term,
    leaderId: nodeId,
    commitIndex,
    entries: [entry],
  });
  logger.info(`[Consensus] committed index=${entry.index} cmd=${command?.type ?? 'unknown'}`);
  return { accepted: true, entry, config: getConsensusConfig() };
}

export function startElection() {
  term += 1;
  role = 'candidate';
  votedFor = nodeId;
  let votes = 1;
  const quorum = Math.ceil((nodes.size + 1) / 2);

  broadcastConsensus('request_vote', { term, candidateId: nodeId });

  // In-process: grant self + healthy peers (simulated)
  for (const [id, peer] of nodes) {
    if (Date.now() - peer.lastHeartbeat < 15_000) votes += 1;
    void id;
  }

  if (votes >= Math.max(quorum, 1)) {
    role = 'leader';
    leaderId = nodeId;
    logger.info(`[Consensus] elected leader=${nodeId} term=${term} votes=${votes}`);
    broadcastConsensus('append_entries', { term, leaderId: nodeId, commitIndex, entries: [] });
  } else {
    role = 'follower';
  }

  return getConsensusConfig();
}

export function applyRemoteAppend({ term: remoteTerm, leaderId: remoteLeader, entries = [], commitIndex: remoteCommit }) {
  if (remoteTerm >= term) {
    term = remoteTerm;
    role = 'follower';
    leaderId = remoteLeader;
    votedFor = remoteLeader;
  }
  for (const e of entries) {
    if (!logs.find((l) => l.id === e.id)) logs.push(e);
  }
  if (remoteCommit > commitIndex) commitIndex = remoteCommit;
  return { ok: true, commitIndex };
}

export function getCommittedLog({ limit = 50 } = {}) {
  return logs.filter((l) => l.index <= commitIndex).slice(-limit);
}

function broadcastConsensus(type, payload) {
  try {
    const io = getIO();
    if (!io) return;
    io.to('consensus:mesh').emit('consensus_raft', {
      type,
      from: nodeId,
      term,
      payload,
      at: Date.now(),
    });
  } catch {
    /* socket optional */
  }
}

export function registerConsensusSocketHandlers(socket) {
  socket.on('join_consensus', () => {
    socket.join('consensus:mesh');
    socket.emit('consensus_state', getConsensusConfig());
  });

  socket.on('consensus_vote', (msg) => {
    if (msg?.term > term) {
      term = msg.term;
      role = 'follower';
      votedFor = msg.candidateId;
    }
  });

  socket.on('consensus_append', (msg) => {
    if (msg?.payload) applyRemoteAppend(msg.payload);
  });
}

/** Scale recommendation from geographic traffic weights */
export function recommendQuorumScale(trafficByRegion = {}) {
  const regions = Object.entries(trafficByRegion);
  const total = regions.reduce((s, [, v]) => s + Number(v || 0), 0) || 1;
  const targetQuorum = Math.max(
    3,
    Math.min(9, 1 + 2 * Math.ceil(Math.log2(Math.max(2, regions.length + 1)))),
  );
  const placement = regions
    .map(([region, weight]) => ({
      region,
      share: Number(weight) / total,
      nodes: Math.max(1, Math.round((Number(weight) / total) * targetQuorum)),
    }))
    .sort((a, b) => b.share - a.share);

  return { targetQuorum, placement, protocol: 'raft-webrtc' };
}
