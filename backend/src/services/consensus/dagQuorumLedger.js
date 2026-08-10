/**
 * Phase 39 — Decentralized swarm DAG ledger + rogue-agent quorum.
 * 2/3 of voters must sign; failed / out-of-bounds agents are quarantined.
 */

import crypto from 'crypto';
import { logger } from '../../utils/logger.js';
import { AppError } from '../../utils/errors.js';
import { appendAuditEvent } from '../security/immutableAuditLedger.js';

const PEPPER = () => process.env.DAG_QUORUM_PEPPER ?? process.env.MCP_IDENTITY_PEPPER ?? 'status-dag-quorum';
const QUORUM_RATIO = parseFloat(process.env.DAG_QUORUM_RATIO ?? '0.67');

const vertices = []; // DAG vertices (append-only)
const edges = []; // parent → child links
const quarantined = new Set();
const pending = new Map(); // proposalId -> proposal

function sign(payload, agentId) {
  return crypto
    .createHmac('sha256', `${PEPPER()}:${agentId}`)
    .update(typeof payload === 'string' ? payload : JSON.stringify(payload))
    .digest('hex');
}

function verifySig(payload, agentId, signature) {
  return sign(payload, agentId) === signature;
}

export function getDagQuorumConfig() {
  return {
    protocol: 'swarm-dag-quorum/v1',
    quorumRatio: QUORUM_RATIO,
    vertices: vertices.length,
    edges: edges.length,
    quarantined: [...quarantined],
    pending: pending.size,
  };
}

export function isQuarantined(agentId) {
  return quarantined.has(agentId);
}

export function quarantineAgent(agentId, reason = 'rogue_behavior') {
  quarantined.add(agentId);
  logger.warn(`[DAG-Quorum] quarantined ${agentId} reason=${reason}`);
  appendAuditEvent({
    type: 'dag.quarantine',
    actor: 'quorum',
    action: 'quarantine',
    decision: reason,
    metadata: { agentId },
  }).catch(() => {});
  return { agentId, quarantined: true, reason };
}

export function releaseQuarantine(agentId) {
  quarantined.delete(agentId);
  return { agentId, quarantined: false };
}

/**
 * Propose a high-stakes operation; collect voter signatures until quorum.
 */
export async function proposeDagOperation({
  operation,
  payload = {},
  proposerId,
  voterIds = [],
  autoSignHonest = true,
}) {
  if (isQuarantined(proposerId)) {
    throw new AppError(`Proposer ${proposerId} is quarantined`, 403, 'DAG_QUARANTINED');
  }

  const eligible = voterIds.filter((id) => !quarantined.has(id));
  const needed = Math.max(1, Math.ceil(eligible.length * QUORUM_RATIO));

  const body = {
    operation,
    payload,
    proposerId,
    voters: eligible,
    needed,
    at: Date.now(),
  };

  const proposalId = crypto.randomUUID();
  const tipHash = vertices.length
    ? vertices[vertices.length - 1].hash
    : crypto.createHash('sha256').update('dag-genesis').digest('hex');

  const proposal = {
    proposalId,
    ...body,
    tipHash,
    signatures: [],
    status: 'pending',
    committed: false,
  };

  // Proposer signature
  proposal.signatures.push({
    agentId: proposerId,
    signature: sign({ proposalId, tipHash, operation, payload }, proposerId),
  });

  // Auto-sign from honest local voters (simulates sub-agent attestation)
  if (autoSignHonest) {
    for (const voter of eligible) {
      if (voter === proposerId) continue;
      // Hallucination / out-of-bounds detection hook
      if (detectRogueVote(voter, operation, payload)) {
        quarantineAgent(voter, 'out_of_bounds_or_hallucination');
        continue;
      }
      proposal.signatures.push({
        agentId: voter,
        signature: sign({ proposalId, tipHash, operation, payload }, voter),
      });
      if (proposal.signatures.length >= needed) break;
    }
  }

  pending.set(proposalId, proposal);

  if (proposal.signatures.length >= needed) {
    return commitProposal(proposalId);
  }

  return { ...proposal, committed: false, needed, signed: proposal.signatures.length };
}

/**
 * Explicit vote from an agent (or reject → quarantine on malicious payload).
 */
export function castDagVote({ proposalId, agentId, approve = true }) {
  const proposal = pending.get(proposalId);
  if (!proposal) throw new AppError('Proposal not found', 404, 'DAG_PROPOSAL_NOT_FOUND');
  if (isQuarantined(agentId)) {
    throw new AppError('Voter quarantined', 403, 'DAG_QUARANTINED');
  }

  if (!approve) {
    quarantineAgent(agentId, 'explicit_reject_flagged');
    return { proposalId, approved: false, quarantined: true };
  }

  if (detectRogueVote(agentId, proposal.operation, proposal.payload)) {
    quarantineAgent(agentId, 'rogue_signature_attempt');
    return { proposalId, approved: false, quarantined: true };
  }

  const signature = sign(
    { proposalId, tipHash: proposal.tipHash, operation: proposal.operation, payload: proposal.payload },
    agentId,
  );
  if (!proposal.signatures.find((s) => s.agentId === agentId)) {
    proposal.signatures.push({ agentId, signature });
  }

  if (proposal.signatures.length >= proposal.needed) {
    return commitProposal(proposalId);
  }
  return { ...proposal, committed: false, signed: proposal.signatures.length };
}

function detectRogueVote(agentId, operation, payload) {
  const blob = JSON.stringify(payload ?? {}).toLowerCase();
  // Out-of-bounds / hallucination heuristics
  if (/drop table|rm -rf|exfiltrate|unlimited_transfer/.test(blob)) return true;
  if (operation === 'transaction_activate' && payload?.amount > 1_000_000) return true;
  if (agentId.includes('rogue')) return true;
  return false;
}

function commitProposal(proposalId) {
  const proposal = pending.get(proposalId);
  if (!proposal) throw new AppError('Proposal not found', 404, 'DAG_PROPOSAL_NOT_FOUND');

  // Verify all signatures
  for (const s of proposal.signatures) {
    const ok = verifySig(
      {
        proposalId,
        tipHash: proposal.tipHash,
        operation: proposal.operation,
        payload: proposal.payload,
      },
      s.agentId,
      s.signature,
    );
    if (!ok) {
      quarantineAgent(s.agentId, 'invalid_signature');
      proposal.status = 'rejected';
      return { ...proposal, committed: false, reason: 'bad_signature' };
    }
  }

  const hash = crypto
    .createHash('sha256')
    .update(`${proposal.tipHash}:${proposalId}:${JSON.stringify(proposal.signatures)}`)
    .digest('hex');

  const vertex = {
    id: proposalId,
    hash,
    parents: [proposal.tipHash],
    operation: proposal.operation,
    payload: proposal.payload,
    signatures: proposal.signatures,
    at: new Date().toISOString(),
  };

  vertices.push(vertex);
  edges.push({ from: proposal.tipHash, to: hash });
  proposal.status = 'committed';
  proposal.committed = true;
  proposal.vertex = vertex;
  pending.delete(proposalId);

  logger.info(`[DAG-Quorum] committed ${proposalId.slice(0, 8)} op=${proposal.operation} sigs=${proposal.signatures.length}`);
  appendAuditEvent({
    type: 'dag.commit',
    actor: proposal.proposerId,
    action: proposal.operation,
    decision: 'committed',
    metadata: { proposalId, hash, sigs: proposal.signatures.length },
  }).catch(() => {});

  return { ...proposal, committed: true, needed: proposal.needed, signed: proposal.signatures.length };
}

export function getDagTip() {
  return vertices.length ? vertices[vertices.length - 1] : null;
}

export function listDagVertices({ limit = 20 } = {}) {
  return vertices.slice(-limit);
}
