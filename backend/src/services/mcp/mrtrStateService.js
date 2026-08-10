/**
 * Phase 34 — Multi Round-Trip Requests (MRTR) + Human-in-the-Loop.
 * Pause saves requestState (Redis / Postgres); resume works on any load-balanced instance.
 */

import crypto from 'crypto';
import { getRedis } from '../../config/redis.js';
import { query } from '../../config/database.js';
import { AppError } from '../../utils/errors.js';
import { logger } from '../../utils/logger.js';
import { assertAgentScope } from './agentIdentityService.js';
import { executeAgentTool } from '../ai/agentTools.js';
import { createEscrow } from '../agents/agentEscrowService.js';

const DEFAULT_TTL_MS = parseInt(process.env.MCP_MRTR_TTL_MS ?? '900000', 10); // 15m
const memory = new Map();

function redisKey(id) {
  return `mcp:mrtr:${id}`;
}

/**
 * Agent pauses workflow and asks the human to validate (e.g. before escrow).
 */
export async function pauseForHuman({
  reason = 'human_validation',
  prompt,
  pendingAction = {},
  identity = null,
  userId = null,
  characterId = null,
  ttlMs = DEFAULT_TTL_MS,
}) {
  if (identity && pendingAction?.type === 'escrow') {
    assertAgentScope(identity, 'escrow:create');
  }

  const requestStateId = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + Math.max(30_000, ttlMs)).toISOString();

  const requestState = {
    id: requestStateId,
    status: 'awaiting_human',
    reason,
    prompt,
    pendingAction,
    userId,
    characterId,
    agentRole: identity?.role ?? null,
    agentJti: identity?.jti ?? null,
    createdAt: new Date().toISOString(),
    expiresAt,
    protocolVersion: '2026-07-28',
  };

  await persistState(requestState, ttlMs);

  logger.info(`[MRTR] paused id=${requestStateId} reason=${reason}`);

  return {
    status: 'awaiting_human',
    requestStateId,
    requestState,
    resumeHint: {
      method: 'mrtr/resume',
      headers: { 'Mcp-Method': 'mrtr/resume', 'Mcp-Name': requestStateId },
      body: { decision: 'approve', userResponse: 'optional note' },
    },
  };
}

/**
 * Resume on any instance — loads requestState, executes or cancels pending action.
 */
export async function resumeFromHuman({
  requestStateId,
  decision = 'approve',
  userResponse = null,
  identity = null,
}) {
  if (!requestStateId) {
    throw new AppError('requestStateId required', 400, 'MRTR_ID_REQUIRED');
  }

  const state = await loadState(requestStateId);
  if (!state) {
    throw new AppError('MRTR requestState not found or expired', 404, 'MRTR_NOT_FOUND');
  }
  if (state.status !== 'awaiting_human') {
    throw new AppError(`MRTR already ${state.status}`, 409, 'MRTR_ALREADY_SETTLED');
  }
  if (new Date(state.expiresAt).getTime() < Date.now()) {
    state.status = 'expired';
    await persistState(state, 60_000);
    throw new AppError('MRTR requestState expired', 410, 'MRTR_EXPIRED');
  }

  state.userResponse = userResponse;
  state.resumedAt = new Date().toISOString();
  state.decision = decision;

  if (decision !== 'approve' && decision !== 'approved') {
    state.status = 'rejected';
    await persistState(state, 300_000);
    return { status: 'rejected', requestStateId, requestState: state, result: null };
  }

  const result = await executePendingAction(state, identity);
  state.status = 'completed';
  state.result = result;
  await persistState(state, 300_000);

  logger.info(`[MRTR] resumed id=${requestStateId} decision=${decision}`);
  return { status: 'completed', requestStateId, requestState: state, result };
}

export async function getMrtrState(requestStateId) {
  if (!requestStateId) {
    throw new AppError('requestStateId required', 400, 'MRTR_ID_REQUIRED');
  }
  const state = await loadState(requestStateId);
  if (!state) {
    throw new AppError('MRTR requestState not found', 404, 'MRTR_NOT_FOUND');
  }
  return { requestState: state };
}

async function executePendingAction(state, identity) {
  const action = state.pendingAction ?? {};
  switch (action.type) {
    case 'escrow':
      return createEscrow({
        characterId: state.characterId ?? action.characterId,
        counterparty: action.counterparty ?? 'compute-market',
        amount: action.amount ?? 3,
        currency: action.currency ?? 'token',
        purpose: action.purpose ?? 'compute_hire',
        metadata: { ...action.metadata, mrtrId: state.id },
        mcpIdentity: identity,
      });
    case 'tool':
      return executeAgentTool(action.toolName, action.arguments ?? {}, {
        userId: state.userId,
        characterId: state.characterId,
        mcpIdentity: identity,
      });
    case 'noop':
    default:
      return { acknowledged: true, action };
  }
}

async function persistState(state, ttlMs) {
  const redis = getRedis();
  if (redis) {
    try {
      await redis.set(redisKey(state.id), JSON.stringify(state), { PX: ttlMs });
    } catch (err) {
      logger.warn(`[MRTR] redis persist failed: ${err.message}`);
    }
  }

  memory.set(state.id, { value: state, expiresAt: Date.now() + ttlMs });

  try {
    await query(
      `INSERT INTO mcp_mrtr_states (id, user_id, character_id, status, request_state, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (id) DO UPDATE SET
         status = EXCLUDED.status,
         request_state = EXCLUDED.request_state,
         expires_at = EXCLUDED.expires_at,
         updated_at = NOW()`,
      [
        state.id,
        state.userId,
        state.characterId,
        state.status,
        JSON.stringify(state),
        state.expiresAt,
      ],
    );
  } catch (err) {
    // Table may not exist in unit tests — memory/redis still work
    logger.warn(`[MRTR] postgres persist skipped: ${err.message}`);
  }
}

async function loadState(id) {
  const redis = getRedis();
  if (redis) {
    try {
      const raw = await redis.get(redisKey(id));
      if (raw) return JSON.parse(raw);
    } catch {
      /* fall through */
    }
  }

  const mem = memory.get(id);
  if (mem && mem.expiresAt >= Date.now()) return mem.value;

  try {
    const { rows } = await query(
      `SELECT request_state FROM mcp_mrtr_states WHERE id = $1 AND expires_at > NOW()`,
      [id],
    );
    if (rows[0]) return typeof rows[0].request_state === 'string'
      ? JSON.parse(rows[0].request_state)
      : rows[0].request_state;
  } catch {
    /* unit tests without DB */
  }

  return null;
}

/** Test helper — clear in-memory MRTR store */
export function _clearMrtrMemory() {
  memory.clear();
}
