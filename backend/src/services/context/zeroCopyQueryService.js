/**
 * Phase 38 — Zero-copy / in-place enterprise querying for ContextEngine.
 * Reads live signals at the source instead of duplicating into vector stores.
 */

import { query } from '../../config/database.js';
import { logger } from '../../utils/logger.js';

const ENABLED = () => process.env.ZERO_COPY_ENABLED !== 'false';

/**
 * In-place sources — views over live tables (no copy into character_memories).
 */
export async function queryLiveSignalsInPlace({
  userId,
  characterId,
  limit = 8,
} = {}) {
  if (!ENABLED() || !userId || !characterId) {
    return { enabled: ENABLED(), items: [], mode: 'disabled_or_missing_ids' };
  }

  const items = [];

  // Live relationship row (absolute latest affinity)
  try {
    const { rows } = await query(
      `SELECT affinity, interaction_count, updated_at, last_interaction_at
       FROM relationships
       WHERE user_id = $1 AND character_id = $2
       LIMIT 1`,
      [userId, characterId],
    );
    if (rows[0]) {
      items.push({
        source: 'live_relationship',
        zeroCopy: true,
        content: `Live affinity=${rows[0].affinity} interactions=${rows[0].interaction_count}`,
        updated_at: rows[0].updated_at ?? rows[0].last_interaction_at,
        importance: 0.7,
      });
    }
  } catch (err) {
    logger.warn(`[ZeroCopy] relationship: ${err.message}`);
  }

  // Live recent messages (source of truth — not embedded copies)
  try {
    const { rows } = await query(
      `SELECT id, content, sender_type, created_at
       FROM messages
       WHERE (sender_id = $1 OR recipient_id = $1)
         AND (character_id = $2 OR metadata->>'characterId' = $2::text)
       ORDER BY created_at DESC
       LIMIT $3`,
      [userId, characterId, limit],
    );
    for (const r of rows) {
      items.push({
        source: 'live_message',
        zeroCopy: true,
        id: r.id,
        content: r.content,
        sender_type: r.sender_type,
        created_at: r.created_at,
        importance: 0.55,
      });
    }
  } catch {
    // Fallback: dm_messages / thread messages schemas vary — try generic threads
    try {
      const { rows } = await query(
        `SELECT id, content, created_at
         FROM dm_messages
         WHERE thread_id IN (
           SELECT id FROM dm_threads
           WHERE user_id = $1 AND character_id = $2
           LIMIT 1
         )
         ORDER BY created_at DESC
         LIMIT $3`,
        [userId, characterId, limit],
      );
      for (const r of rows) {
        items.push({
          source: 'live_dm',
          zeroCopy: true,
          id: r.id,
          content: r.content,
          created_at: r.created_at,
          importance: 0.55,
        });
      }
    } catch (err) {
      logger.warn(`[ZeroCopy] messages: ${err.message}`);
    }
  }

  // Live energy / wallet signal (no wallet snapshot table duplication)
  try {
    const { rows } = await query(
      `SELECT energy_pool, token_balance, updated_at
       FROM agent_wallets WHERE character_id = $1 LIMIT 1`,
      [characterId],
    );
    if (rows[0]) {
      items.push({
        source: 'live_wallet',
        zeroCopy: true,
        content: `Wallet energy=${rows[0].energy_pool} tokens=${rows[0].token_balance}`,
        updated_at: rows[0].updated_at,
        importance: 0.4,
      });
    }
  } catch (err) {
    logger.warn(`[ZeroCopy] wallet: ${err.message}`);
  }

  logger.info(`[ZeroCopy] in-place items=${items.length}`);
  return {
    enabled: true,
    mode: 'in_place',
    items,
    lagMs: 0,
    note: 'Queried enterprise sources directly — no vector DB sync',
  };
}

export function formatZeroCopyPromptBlock(live) {
  if (!live?.items?.length) return null;
  return [
    'Live enterprise signals (zero-copy, in-place):',
    ...live.items.slice(0, 10).map((i) => `- [${i.source}] ${String(i.content).slice(0, 200)}`),
  ].join('\n');
}

export function getZeroCopyConfig() {
  return {
    enabled: ENABLED(),
    sources: ['relationships', 'messages|dm_messages', 'agent_wallets'],
    syncLag: 'none',
  };
}
