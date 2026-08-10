import pool, { query } from '../config/database.js';
import { ENERGY_COSTS, spendEnergy } from '../services/energyService.js';
import { isAiPending, consumeInteraction } from '../services/messageQueueService.js';
import { validationError } from '../utils/errors.js';

export async function listThreads(req, res) {
  const userId = req.user.id;

  const { rows } = await query(
    `SELECT
       t.id,
       t.last_message_at,
       t.created_at,
       c.id AS character_id,
       c.name AS character_name,
       c.handle AS character_handle,
       c.avatar_url AS character_avatar,
       c.fandom AS character_fandom,
       (
         SELECT content FROM dm_messages m
         WHERE m.thread_id = t.id
         ORDER BY m.created_at DESC
         LIMIT 1
       ) AS last_message_preview,
       (
         SELECT sender_type FROM dm_messages m
         WHERE m.thread_id = t.id
         ORDER BY m.created_at DESC
         LIMIT 1
       ) AS last_sender_type
     FROM dm_threads t
     JOIN ai_characters c ON t.character_id = c.id
     WHERE t.user_id = $1
     ORDER BY t.last_message_at DESC NULLS LAST, t.created_at DESC`,
    [userId]
  );

  const data = rows.map((row) => ({
    ...row,
    ai_pending: isAiPending(row.id),
  }));

  res.json({ data });
}

export async function getThreadMessages(req, res) {
  const userId = req.user.id;
  const { threadId } = req.params;

  const thread = await query(
    `SELECT id FROM dm_threads WHERE id = $1 AND user_id = $2`,
    [threadId, userId]
  );

  if (thread.rows.length === 0) {
    return res.status(404).json({ error: 'Thread not found' });
  }

  const { rows } = await query(
    `SELECT id, sender_type, content, is_read, created_at
     FROM dm_messages
     WHERE thread_id = $1
     ORDER BY created_at ASC`,
    [threadId]
  );

  const pending = consumeInteraction(threadId);

  res.json({
    data: rows,
    meta: {
      aiPending: isAiPending(threadId),
      interaction: pending,
    },
  });
}

export async function getOrCreateThread(req, res) {
  const userId = req.user.id;
  const { characterId } = req.params;

  const character = await query(
    `SELECT id, name, handle, avatar_url, fandom FROM ai_characters
     WHERE id = $1 AND is_active = TRUE`,
    [characterId]
  );

  if (character.rows.length === 0) {
    return res.status(404).json({ error: 'Character not found' });
  }

  let threadId;
  const existing = await query(
    `SELECT id FROM dm_threads WHERE user_id = $1 AND character_id = $2`,
    [userId, characterId]
  );

  if (existing.rows.length > 0) {
    threadId = existing.rows[0].id;
  } else {
    const created = await query(
      `INSERT INTO dm_threads (user_id, character_id) VALUES ($1, $2) RETURNING id`,
      [userId, characterId]
    );
    threadId = created.rows[0].id;
  }

  res.json({
    data: {
      threadId,
      character: character.rows[0],
      aiPending: isAiPending(threadId),
    },
  });
}

export async function sendMessage(req, res) {
  const { characterId, content } = req.body;
  const userId = req.user.id;

  if (!characterId || !content?.trim()) {
    throw validationError('characterId and content are required');
  }

  const characterCheck = await query(
    `SELECT id FROM ai_characters WHERE id = $1 AND is_active = TRUE`,
    [characterId]
  );

  if (characterCheck.rows.length === 0) {
    return res.status(404).json({ error: 'Character not found' });
  }

  const client = await pool.connect();
  let threadId;
  let userMessage;
  let energyResult;

  try {
    await client.query('BEGIN');

    energyResult = await spendEnergy(userId, 'dm', client);

    const existing = await client.query(
      `SELECT id FROM dm_threads WHERE user_id = $1 AND character_id = $2`,
      [userId, characterId]
    );

    if (existing.rows.length > 0) {
      threadId = existing.rows[0].id;
    } else {
      const created = await client.query(
        `INSERT INTO dm_threads (user_id, character_id)
         VALUES ($1, $2)
         RETURNING id`,
        [userId, characterId]
      );
      threadId = created.rows[0].id;
    }

    const inserted = await client.query(
      `INSERT INTO dm_messages (thread_id, sender_type, content)
       VALUES ($1, 'user', $2)
       RETURNING id, sender_type, content, is_read, created_at`,
      [threadId, content.trim()]
    );
    userMessage = inserted.rows[0];

    await client.query(
      `UPDATE dm_threads SET last_message_at = NOW() WHERE id = $1`,
      [threadId]
    );

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    client.release();
    throw err;
  }

  client.release();

  queueDmAiReply({
    user: req.user,
    characterId,
    threadId,
    userMessageContent: content.trim(),
  });

  res.status(201).json({
    data: userMessage,
    threadId,
    energy: energyResult.state,
    spent: energyResult.spent,
    costs: ENERGY_COSTS,
    aiPending: true,
  });
}
