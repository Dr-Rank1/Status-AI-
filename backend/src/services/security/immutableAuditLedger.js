/**
 * Phase 38 — Immutable forensic audit ledger (hash-chained, append-only).
 */

import crypto from 'crypto';
import { query } from '../../config/database.js';
import { logger } from '../../utils/logger.js';

const memoryChain = [];
let lastHash = process.env.AUDIT_GENESIS_HASH
  ?? crypto.createHash('sha256').update('status-audit-genesis-v38').digest('hex');

function hashEntry(prevHash, body) {
  return crypto
    .createHash('sha256')
    .update(`${prevHash}:${JSON.stringify(body)}`)
    .digest('hex');
}

/**
 * Append an immutable audit event. Never updates/deletes prior rows.
 */
export async function appendAuditEvent({
  type,
  actor = 'system',
  action = null,
  decision = null,
  metadata = {},
  characterId = null,
  userId = null,
}) {
  const at = new Date().toISOString();
  const body = {
    type,
    actor,
    action,
    decision,
    metadata,
    characterId,
    userId,
    at,
  };
  const entryHash = hashEntry(lastHash, body);
  const entry = {
    id: crypto.randomUUID(),
    ...body,
    prevHash: lastHash,
    entryHash,
  };

  memoryChain.push(entry);
  lastHash = entryHash;

  try {
    await query(
      `INSERT INTO agent_audit_ledger (
         id, event_type, actor, action, decision, metadata,
         character_id, user_id, prev_hash, entry_hash, created_at
       ) VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9,$10,$11)`,
      [
        entry.id,
        type,
        actor,
        action,
        decision,
        JSON.stringify(metadata ?? {}),
        characterId,
        userId,
        entry.prevHash,
        entry.entryHash,
        at,
      ],
    );
  } catch (err) {
    logger.warn(`[Audit] persist skipped: ${err.message}`);
  }

  return entry;
}

export async function listAuditEvents({ limit = 50, type = null } = {}) {
  try {
    const { rows } = await query(
      `SELECT * FROM agent_audit_ledger
       WHERE ($1::text IS NULL OR event_type = $1)
       ORDER BY created_at DESC
       LIMIT $2`,
      [type, Math.min(limit, 200)],
    );
    if (rows.length) return rows;
  } catch {
    /* fall through */
  }
  return memoryChain.slice(-limit).reverse();
}

/**
 * Verify hash chain integrity (memory slice or provided rows).
 */
export function verifyAuditChain(entries = memoryChain) {
  if (!entries.length) return { valid: true, checked: 0 };
  const ordered = [...entries].sort((a, b) => String(a.created_at ?? a.at).localeCompare(String(b.created_at ?? b.at)));
  let prev = ordered[0].prev_hash ?? ordered[0].prevHash;
  let checked = 0;
  for (const e of ordered) {
    const body = {
      type: e.event_type ?? e.type,
      actor: e.actor,
      action: e.action,
      decision: e.decision,
      metadata: typeof e.metadata === 'string' ? JSON.parse(e.metadata) : (e.metadata ?? {}),
      characterId: e.character_id ?? e.characterId,
      userId: e.user_id ?? e.userId,
      at: e.created_at ?? e.at,
    };
    const expect = hashEntry(prev, body);
    const actual = e.entry_hash ?? e.entryHash;
    if (expect !== actual) {
      return { valid: false, checked, brokenAt: e.id };
    }
    prev = actual;
    checked += 1;
  }
  return { valid: true, checked };
}

export function getAuditTip() {
  return { lastHash, memoryLength: memoryChain.length };
}

/** Test helper */
export function _resetAuditMemory() {
  memoryChain.length = 0;
  lastHash = process.env.AUDIT_GENESIS_HASH
    ?? crypto.createHash('sha256').update('status-audit-genesis-v38').digest('hex');
}
