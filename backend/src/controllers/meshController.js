import {
  registerMeshPeer,
  listClusterPeers,
  relaySignal,
  recordGossip,
  getMeshStatus,
} from '../services/meshRelayService.js';

export async function registerPeer(req, res) {
  const { peerId, clusterId, capabilities, metadata } = req.body;
  const peer = await registerMeshPeer({
    peerId,
    userId: req.user.id,
    clusterId,
    capabilities: capabilities ?? [],
    metadata: metadata ?? {},
  });
  res.status(201).json({ data: peer });
}

export async function listPeers(req, res) {
  const clusterId = req.params.clusterId ?? req.query.clusterId ?? 'default';
  const peers = await listClusterPeers(clusterId);
  res.json({ data: peers });
}

export async function signal(req, res) {
  const { fromPeerId, toPeerId, signalType, payload } = req.body;
  const relay = await relaySignal({ fromPeerId, toPeerId, signalType, payload });
  res.json({ data: relay });
}

export async function gossip(req, res) {
  const { clusterId, recordType, recordKey, payload, originPeerId } = req.body;
  const result = await recordGossip({ clusterId, recordType, recordKey, payload, originPeerId });
  res.json({ data: result });
}

export async function status(req, res) {
  const clusterId = req.query.clusterId ?? 'default';
  const data = await getMeshStatus(clusterId);
  res.json({ data });
}
