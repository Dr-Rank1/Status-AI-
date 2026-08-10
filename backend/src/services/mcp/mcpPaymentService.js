/**
 * Phase 35 — MCP HTTP 402 agent micro-economies.
 * Sub-agents charge utility tokens for specialized tools (research → dialogue, etc.).
 */

import crypto from 'crypto';
import { query } from '../../config/database.js';
import { debitWallet, creditWallet, getOrCreateWallet } from '../agentWalletService.js';
import { AppError } from '../../utils/errors.js';
import { logger } from '../../utils/logger.js';

/** Default token prices by MCP tool / method */
export const MCP_TOOL_PRICES = {
  web_search: { amount: 2, currency: 'token', payeeRole: 'research' },
  create_calendar_event: { amount: 1, currency: 'token', payeeRole: 'tools' },
  generate_external_link: { amount: 1, currency: 'token', payeeRole: 'tools' },
  run_sandboxed_script: { amount: 3, currency: 'token', payeeRole: 'tools' },
  'context/assemble': { amount: 1, currency: 'token', payeeRole: 'coordinator' },
};

const PAYMENTS_ENABLED = () => process.env.MCP_HTTP_402_ENABLED !== 'false';

export function priceForTool(toolName) {
  return MCP_TOOL_PRICES[toolName] ?? null;
}

/**
 * Settle inter-agent micropayment or throw 402 Payment Required.
 */
export async function settleMcpToolPayment({
  toolName,
  payerCharacterId,
  payeeCharacterId = null,
  payerRole = null,
  payerIdentity = null,
  requestId = null,
  skipPayment = false,
}) {
  if (!PAYMENTS_ENABLED() || skipPayment) {
    return { charged: false, reason: skipPayment ? 'skipped' : 'disabled' };
  }

  const price = priceForTool(toolName);
  if (!price) return { charged: false, reason: 'free_tool' };

  if (!payerCharacterId) {
    throw paymentRequiredError({
      toolName,
      price,
      detail: 'payerCharacterId required for paid MCP tools',
    });
  }

  // Same-character self-service is free (no circular charge)
  if (payeeCharacterId && payeeCharacterId === payerCharacterId && payerRole === price.payeeRole) {
    return { charged: false, reason: 'self_service' };
  }

  const payeeId = payeeCharacterId ?? payerCharacterId;
  await getOrCreateWallet(payerCharacterId);
  await getOrCreateWallet(payeeId);

  const debited = await debitWallet({
    characterId: payerCharacterId,
    amount: price.amount,
    currency: price.currency,
    reason: `mcp402:${toolName}`,
    metadata: {
      payeeRole: price.payeeRole,
      payerRole,
      requestId,
      jti: payerIdentity?.jti,
    },
  });

  if (!debited) {
    throw paymentRequiredError({
      toolName,
      price,
      detail: 'Insufficient agent wallet balance',
      payerCharacterId,
    });
  }

  await creditWallet({
    characterId: payeeId,
    amount: price.amount,
    currency: price.currency,
    reason: `mcp402_earn:${toolName}`,
    metadata: { payerRole, payerCharacterId, requestId },
  });

  const ledger = await recordEconomyLedger({
    payerRole: payerRole ?? payerIdentity?.role ?? 'unknown',
    payeeRole: price.payeeRole,
    payerCharacterId,
    payeeCharacterId: payeeId,
    amount: price.amount,
    currency: price.currency,
    method: toolName,
    requestId,
    metadata: { protocol: 'HTTP-402', mcp: true },
  });

  logger.info(
    `[MCP-402] ${payerRole ?? '?'}→${price.payeeRole} ${price.amount}${price.currency} tool=${toolName}`,
  );

  return {
    charged: true,
    amount: price.amount,
    currency: price.currency,
    payeeRole: price.payeeRole,
    ledgerId: ledger?.id,
  };
}

function paymentRequiredError({ toolName, price, detail, payerCharacterId }) {
  const err = new AppError(detail ?? 'Payment Required', 402, 'MCP_PAYMENT_REQUIRED');
  err.payment = {
    type: 'http-402',
    tool: toolName,
    amount: price.amount,
    currency: price.currency,
    payeeRole: price.payeeRole,
    payerCharacterId: payerCharacterId ?? null,
    accepts: [`status-token/${price.currency}`],
  };
  return err;
}

export async function recordEconomyLedger({
  payerRole,
  payeeRole,
  payerCharacterId,
  payeeCharacterId,
  amount,
  currency = 'token',
  method,
  requestId = null,
  metadata = {},
}) {
  const id = crypto.randomUUID();
  try {
    const { rows } = await query(
      `INSERT INTO agent_economy_ledger (
         id, payer_role, payee_role, payer_character_id, payee_character_id,
         amount, currency, method, request_id, metadata
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb)
       RETURNING *`,
      [
        id,
        payerRole,
        payeeRole,
        payerCharacterId,
        payeeCharacterId,
        amount,
        currency,
        method,
        requestId,
        JSON.stringify(metadata),
      ],
    );
    return rows[0];
  } catch (err) {
    logger.warn(`[Economy] ledger write skipped: ${err.message}`);
    return {
      id,
      payer_role: payerRole,
      payee_role: payeeRole,
      amount,
      currency,
      method,
      created_at: new Date().toISOString(),
    };
  }
}

export async function getEconomyLedger({ limit = 50, sinceHours = 24 } = {}) {
  try {
    const { rows } = await query(
      `SELECT *
       FROM agent_economy_ledger
       WHERE created_at > NOW() - ($1::text || ' hours')::interval
       ORDER BY created_at DESC
       LIMIT $2`,
      [String(sinceHours), Math.min(limit, 200)],
    );
    return rows;
  } catch {
    return [];
  }
}

export async function getEconomyVelocity({ sinceHours = 24 } = {}) {
  const rows = await getEconomyLedger({ limit: 500, sinceHours });
  const totalVolume = rows.reduce((s, r) => s + (r.amount ?? 0), 0);
  const byEdge = {};
  for (const r of rows) {
    const key = `${r.payer_role || r.payerRole}→${r.payee_role || r.payeeRole}`;
    byEdge[key] = (byEdge[key] ?? 0) + (r.amount ?? 0);
  }
  return {
    sinceHours,
    txCount: rows.length,
    totalVolume,
    tokenVelocity: sinceHours > 0 ? totalVolume / sinceHours : totalVolume,
    edges: byEdge,
    recent: rows.slice(0, 25),
  };
}
