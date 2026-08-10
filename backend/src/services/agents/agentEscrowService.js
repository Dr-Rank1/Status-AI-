/**
 * Phase 33 — Sovereign agent economies: smart-contract escrow + micro-inference hire.
 */

import crypto from 'crypto';
import { query } from '../../config/database.js';
import { getOrCreateWallet, debitWallet, creditWallet } from '../agentWalletService.js';
import { assertAgentScope, withAgentIdentity } from '../mcp/agentIdentityService.js';
import { logger } from '../../utils/logger.js';
import { AppError } from '../../utils/errors.js';

const QUEUE_HIRE_THRESHOLD = parseInt(process.env.AGENT_QUEUE_HIRE_THRESHOLD ?? '8', 10);
const HIRE_TOKEN_COST = parseInt(process.env.AGENT_HIRE_TOKEN_COST ?? '3', 10);
const ESCROW_TTL_SEC = parseInt(process.env.AGENT_ESCROW_TTL_SEC ?? '3600', 10);

/**
 * Deterministic "contract address" for an escrow agreement (simulated EVM).
 */
export function deriveEscrowContractAddress({ characterId, counterparty, salt }) {
  return `0x${crypto
    .createHash('sha256')
    .update(`status-escrow:${characterId}:${counterparty}:${salt}`)
    .digest('hex')
    .slice(0, 40)}`;
}

export async function createEscrow({
  characterId,
  counterparty = 'compute-market',
  amount,
  currency = 'token',
  purpose = 'compute_hire',
  metadata = {},
  mcpIdentity = null,
}) {
  const { assertAgentsNotKilled } = await import('../security/globalKillSwitchService.js');
  assertAgentsNotKilled();

  if (mcpIdentity) {
    assertAgentScope(mcpIdentity, 'escrow:create');
  }

  const { enforceGovernanceOrEscalate } = await import('../governance/governanceAsCode.js');
  const gov = await enforceGovernanceOrEscalate({
    action: 'escrow:create',
    amount,
    agentBinding: mcpIdentity
      ? { agentRole: mcpIdentity.role, scopes: mcpIdentity.scopes }
      : { agentRole: 'transaction', scopes: ['escrow:create', 'wallet:debit'] },
    characterId,
    pendingAction: {
      type: 'escrow',
      characterId,
      counterparty,
      amount,
      currency,
      purpose,
      metadata,
    },
    autoEscalate: metadata?.autoEscalate !== false,
  });

  if (gov.escalated) {
    return { status: 'awaiting_human', governance: gov, hitl: gov.hitl };
  }

  const wallet = await getOrCreateWallet(characterId);
  const debited = await debitWallet({
    characterId,
    amount,
    currency,
    reason: `escrow:${purpose}`,
    metadata: { ...metadata, counterparty },
  });

  if (!debited) {
    throw new AppError('Insufficient agent wallet balance for escrow', 409, 'ESCROW_INSUFFICIENT_FUNDS');
  }

  const salt = crypto.randomUUID();
  const contractAddress = deriveEscrowContractAddress({ characterId, counterparty, salt });
  const expiresAt = new Date(Date.now() + ESCROW_TTL_SEC * 1000).toISOString();

  const { rows } = await query(
    `INSERT INTO agent_escrows (
       character_id, wallet_id, counterparty, contract_address, amount, currency,
       purpose, status, metadata, expires_at, salt
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'locked', $8, $9, $10)
     RETURNING *`,
    [
      characterId,
      wallet.id,
      counterparty,
      contractAddress,
      amount,
      currency,
      purpose,
      JSON.stringify({ ...metadata, salt }),
      expiresAt,
      salt,
    ],
  );

  try {
    const { appendAuditEvent } = await import('../security/immutableAuditLedger.js');
    await appendAuditEvent({
      type: 'escrow.create',
      actor: mcpIdentity?.role ?? 'transaction',
      action: 'escrow:create',
      decision: 'locked',
      metadata: { contractAddress, amount, currency },
      characterId,
    });
  } catch {
    /* audit best-effort */
  }

  logger.info(`[Escrow] locked ${amount} ${currency} contract=${contractAddress}`);
  return rows[0];
}

export async function releaseEscrow({
  escrowId,
  releaseTo = 'counterparty',
  mcpIdentity = null,
}) {
  if (mcpIdentity) {
    assertAgentScope(mcpIdentity, 'escrow:release');
  }

  const { rows } = await query(
    `UPDATE agent_escrows
     SET status = 'released', released_at = NOW(), updated_at = NOW()
     WHERE id = $1 AND status = 'locked'
     RETURNING *`,
    [escrowId],
  );

  if (!rows[0]) {
    throw new AppError('Escrow not found or already settled', 404, 'ESCROW_NOT_FOUND');
  }

  const escrow = rows[0];

  if (releaseTo === 'refund') {
    await creditWallet({
      characterId: escrow.character_id,
      amount: escrow.amount,
      currency: escrow.currency,
      reason: 'escrow_refund',
      metadata: { escrowId },
    });
  }

  // counterparty payout is recorded as ledger metadata (external node settlement)
  await query(
    `INSERT INTO agent_wallet_transactions
       (wallet_id, character_id, tx_type, amount, currency, reason, metadata)
     VALUES ($1, $2, 'escrow_release', $3, $4, $5, $6)`,
    [
      escrow.wallet_id,
      escrow.character_id,
      escrow.amount,
      escrow.currency,
      `escrow_release:${releaseTo}`,
      JSON.stringify({ escrowId, contractAddress: escrow.contract_address, releaseTo }),
    ],
  );

  return escrow;
}

/**
 * When local inference queue is overloaded, hire a decentralized micro-node via escrow.
 */
export async function hireMicroInferenceNode({
  characterId,
  queueDepth,
  nodeId = null,
  mcpIdentity = null,
}) {
  if (mcpIdentity) {
    assertAgentScope(mcpIdentity, 'compute:hire');
  }

  if (queueDepth < QUEUE_HIRE_THRESHOLD) {
    return { hired: false, reason: 'queue_below_threshold', queueDepth, threshold: QUEUE_HIRE_THRESHOLD };
  }

  return withAgentIdentity('transaction', { characterId }, async ({ identity }) => {
    const counterparty = nodeId ?? `micro-node-${crypto.randomBytes(3).toString('hex')}`;
    const escrow = await createEscrow({
      characterId,
      counterparty,
      amount: HIRE_TOKEN_COST,
      currency: 'token',
      purpose: 'micro_inference_hire',
      metadata: { queueDepth, hiredAt: new Date().toISOString() },
      mcpIdentity: identity,
    });

    return {
      hired: true,
      nodeId: counterparty,
      escrowId: escrow.id,
      contractAddress: escrow.contract_address,
      tokenCost: HIRE_TOKEN_COST,
      queueDepth,
    };
  });
}

export async function listEscrows(characterId, { status = null, limit = 20 } = {}) {
  if (status) {
    const { rows } = await query(
      `SELECT * FROM agent_escrows
       WHERE character_id = $1 AND status = $2
       ORDER BY created_at DESC LIMIT $3`,
      [characterId, status, limit],
    );
    return rows;
  }

  const { rows } = await query(
    `SELECT * FROM agent_escrows
     WHERE character_id = $1
     ORDER BY created_at DESC LIMIT $2`,
    [characterId, limit],
  );
  return rows;
}

export function getEscrowConfig() {
  return {
    queueHireThreshold: QUEUE_HIRE_THRESHOLD,
    hireTokenCost: HIRE_TOKEN_COST,
    escrowTtlSec: ESCROW_TTL_SEC,
  };
}
