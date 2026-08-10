import { query } from '../config/database.js';
import { logger } from '../utils/logger.js';

export async function getSyncPayload(req, res) {
  const userId = req.user.id;

  const [{ rows: threads }, { rows: characters }, { rows: energy }] = await Promise.all([
    query(
      `SELECT c.name, c.handle, c.fandom,
              (SELECT content FROM dm_messages m
               JOIN dm_threads t ON t.id = m.thread_id
               WHERE t.user_id = $1 AND t.character_id = c.id
               ORDER BY m.created_at DESC LIMIT 1) AS last_message,
              (SELECT sender_type FROM dm_messages m
               JOIN dm_threads t ON t.id = m.thread_id
               WHERE t.user_id = $1 AND t.character_id = c.id
               ORDER BY m.created_at DESC LIMIT 1) AS last_sender
       FROM dm_threads t
       JOIN ai_characters c ON c.id = t.character_id
       WHERE t.user_id = $1
       ORDER BY t.last_message_at DESC NULLS LAST
       LIMIT 5`,
      [userId],
    ),
    query(
      `SELECT name, handle, fandom, follower_count
       FROM ai_characters
       WHERE is_active = TRUE
       ORDER BY follower_count DESC
       LIMIT 3`,
    ),
    query(
      `SELECT energy_remaining, energy_max FROM energy_state WHERE user_id = $1`,
      [userId],
    ),
  ]);

  const ambient = threads.map((t) => ({
    type: 'thread_update',
    character: t.name,
    handle: t.handle,
    preview: t.last_sender === 'character' ? t.last_message : 'You: …',
    fandom: t.fandom,
  }));

  for (const c of characters) {
    ambient.push({
      type: 'character_status',
      character: c.name,
      handle: c.handle,
      preview: `${c.follower_count} followers · ${c.fandom}`,
    });
  }

  res.json({
    data: {
      version: 1,
      generatedAt: new Date().toISOString(),
      energy: energy[0] ?? { energy_remaining: 100, energy_max: 100 },
      ambient,
    },
  });
}

export async function ingestWearableEvent(req, res) {
  const { eventType, payload } = req.body;
  logger.info(`[Wearable] user=${req.user.id} event=${eventType}`, payload ?? {});
  res.status(202).json({ accepted: true });
}
