/**
 * Phase 41 — Delay-Tolerant Networking (DTN) Bundle Protocol (RFC 9171–inspired)
 * and high-latency consensus reconciliation for edge / interplanetary meshes.
 */

import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { logger } from '../../utils/logger.js';
import { AppError } from '../../utils/errors.js';
import { proposeEntry, getCommittedLog } from '../consensus/raftConsensusMesh.js';
import { appendAuditEvent } from '../security/immutableAuditLedger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STORE_DIR = process.env.DTN_STORE_DIR
  ?? path.join(__dirname, '../../../../data/dtn-bundles');

const TTL_SEC = parseInt(process.env.DTN_BUNDLE_TTL_SEC ?? '86400', 10);
const CUSTODY = () => process.env.DTN_CUSTODY_TRANSFER !== 'false';

/** Local custody store (in-memory + durable JSONL). */
const bundles = new Map();
const pendingReconcile = [];

function eid(nodeId, service = 'status') {
  return `dtn://${nodeId}/${service}`;
}

/**
 * Create a Bundle Protocol primary block + payload (RFC 9171–shaped).
 */
export function createBundle({
  sourceNode = 'local',
  destNode = 'remote',
  service = 'consensus',
  payload = {},
  lifetimeSec = TTL_SEC,
  custodyTransfer = CUSTODY(),
  priority = 1,
} = {}) {
  const creationTimestamp = Date.now();
  const bundleId = crypto.randomUUID();
  const primary = {
    version: 7,
    flags: {
      custodyTransferRequested: Boolean(custodyTransfer),
      mustNotFragment: true,
      ackRequested: true,
    },
    destination: eid(destNode, service),
    source: eid(sourceNode, service),
    reportTo: eid(sourceNode, 'reports'),
    creationTimestamp,
    lifetime: lifetimeSec * 1000,
    bundleId,
    priority,
  };
  const payloadBlock = {
    type: 'payload',
    data: payload,
    crc: crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex').slice(0, 16),
  };
  const bundle = {
    primary,
    blocks: [payloadBlock],
    status: 'custody_local',
    delivered: false,
    createdAt: new Date(creationTimestamp).toISOString(),
    expiresAt: new Date(creationTimestamp + lifetimeSec * 1000).toISOString(),
  };
  bundles.set(bundleId, bundle);
  pendingReconcile.push(bundleId);
  void persistBundle(bundle);
  logger.info(`[DTN] bundle ${bundleId.slice(0, 8)} ${primary.source} → ${primary.destination}`);
  return bundle;
}

async function persistBundle(bundle) {
  try {
    await fs.mkdir(STORE_DIR, { recursive: true });
    const file = path.join(STORE_DIR, `${bundle.primary.bundleId}.json`);
    await fs.writeFile(file, JSON.stringify(bundle, null, 2), 'utf8');
  } catch (err) {
    logger.warn(`[DTN] persist skipped: ${err.message}`);
  }
}

export function getBundle(bundleId) {
  return bundles.get(bundleId) ?? null;
}

export function listCustodiedBundles({ limit = 50 } = {}) {
  return [...bundles.values()]
    .filter((b) => !b.delivered)
    .sort((a, b) => b.primary.creationTimestamp - a.primary.creationTimestamp)
    .slice(0, limit);
}

/**
 * Simulate hop / custody transfer toward destination when link is up.
 */
export function transferCustody(bundleId, { nextHop = null, connected = true } = {}) {
  const bundle = bundles.get(bundleId);
  if (!bundle) throw new AppError('Bundle not found', 404, 'DTN_BUNDLE_MISSING');
  if (Date.now() > Date.parse(bundle.expiresAt)) {
    bundle.status = 'expired';
    return bundle;
  }
  if (!connected) {
    bundle.status = 'deferred_connectivity';
    return bundle;
  }
  bundle.status = nextHop ? `custody_${nextHop}` : 'in_transit';
  bundle.lastHopAt = new Date().toISOString();
  return bundle;
}

/**
 * Execute a transaction locally under DTN (store-and-forward).
 */
export function executeLocalDtnTransaction({
  nodeId = 'edge-1',
  operation = 'ledger_append',
  payload = {},
  destNode = 'core',
} = {}) {
  const localReceipt = {
    txId: crypto.randomUUID(),
    nodeId,
    operation,
    payload,
    deterministicHash: crypto
      .createHash('sha256')
      .update(JSON.stringify({ operation, payload, nodeId }))
      .digest('hex'),
    at: new Date().toISOString(),
    mode: 'dtn_local',
  };
  const bundle = createBundle({
    sourceNode: nodeId,
    destNode,
    service: 'consensus',
    payload: { type: 'transaction', receipt: localReceipt },
    priority: 2,
  });
  return { receipt: localReceipt, bundle };
}

/**
 * Deterministic ledger reconciliation when connectivity returns.
 * Merges DTN custodied txs into raft-committed log (idempotent by hash).
 */
export async function reconcileDtnState({
  connected = true,
  nodeId = 'edge-1',
} = {}) {
  if (!connected) {
    return {
      reconciled: 0,
      deferred: listCustodiedBundles().length,
      reason: 'offline',
    };
  }

  const committed = getCommittedLog?.() ?? [];
  const knownHashes = new Set(
    committed.map((e) => e?.hash ?? e?.payload?.deterministicHash).filter(Boolean),
  );

  let applied = 0;
  const results = [];

  for (const id of [...pendingReconcile]) {
    const bundle = bundles.get(id);
    if (!bundle || bundle.delivered) continue;
    if (Date.now() > Date.parse(bundle.expiresAt)) {
      bundle.status = 'expired';
      continue;
    }

    transferCustody(id, { connected: true, nextHop: 'core' });
    const payload = bundle.blocks.find((b) => b.type === 'payload')?.data;
    const hash = payload?.receipt?.deterministicHash;
    if (hash && knownHashes.has(hash)) {
      bundle.delivered = true;
      bundle.status = 'duplicate_suppressed';
      results.push({ bundleId: id, status: 'duplicate_suppressed' });
      continue;
    }

    try {
      const entry = proposeEntry({
        type: 'dtn_reconcile',
        from: nodeId,
        payload,
        hash,
      });
      if (entry?.accepted === false) {
        bundle.status = 'awaiting_consensus';
        results.push({ bundleId: id, status: 'awaiting_consensus', reason: entry.reason });
        continue;
      }
      if (hash) knownHashes.add(hash);
      bundle.delivered = true;
      bundle.status = 'delivered_reconciled';
      bundle.consensusEntry = entry?.index ?? entry?.entry?.index ?? null;
      applied += 1;
      results.push({ bundleId: id, status: 'delivered_reconciled' });
    } catch (err) {
      // Raft may require leader — keep custody
      bundle.status = 'awaiting_consensus';
      results.push({ bundleId: id, status: 'awaiting_consensus', error: err.message });
    }
  }

  // Compact pending
  for (let i = pendingReconcile.length - 1; i >= 0; i -= 1) {
    const b = bundles.get(pendingReconcile[i]);
    if (b?.delivered || b?.status === 'expired') pendingReconcile.splice(i, 1);
  }

  await appendAuditEvent({
    type: 'dtn.reconcile',
    actor: nodeId,
    action: 'reconcile',
    decision: applied > 0 ? 'applied' : 'noop',
    metadata: { applied, remaining: pendingReconcile.length },
  }).catch(() => {});

  logger.info(`[DTN] reconcile applied=${applied} pending=${pendingReconcile.length}`);
  return {
    reconciled: applied,
    pending: pendingReconcile.length,
    results,
    protocol: 'bundle-protocol/rfc9171-shaped',
  };
}

export function getDtnConfig() {
  return {
    storeDir: STORE_DIR,
    ttlSec: TTL_SEC,
    custodyTransfer: CUSTODY(),
    custodied: [...bundles.values()].filter((b) => !b.delivered).length,
    pendingReconcile: pendingReconcile.length,
    rfc: '9171',
  };
}

/** Test helper */
export function resetDtnStore() {
  bundles.clear();
  pendingReconcile.length = 0;
}
