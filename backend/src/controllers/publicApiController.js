import { query } from '../config/database.js';
import { generateCharacterReply } from '../services/ai/index.js';
import { validationError } from '../utils/errors.js';

const FEED_SELECT = `
  SELECT p.id, p.content, p.image_url, p.fandom, p.like_count, p.reply_count,
         p.created_at, c.name AS character_name, c.handle AS character_handle
  FROM posts p
  LEFT JOIN ai_characters c ON p.author_character_id = c.id
  WHERE p.parent_post_id IS NULL
`;

export async function publicFeed(req, res) {
  const limit = Math.min(parseInt(req.query.limit ?? '20', 10), 50);
  const fandom = req.query.fandom ?? null;

  let sql = FEED_SELECT;
  const params = [];

  if (fandom) {
    params.push(fandom);
    sql += ` AND p.fandom = $${params.length}`;
  }

  params.push(limit);
  sql += ` ORDER BY p.created_at DESC LIMIT $${params.length}`;

  const { rows } = await query(sql, params);
  res.json({ data: rows, meta: { limit, fandom } });
}

export async function publicCharacters(req, res) {
  const { rows } = await query(
    `SELECT id, name, handle, fandom, bio, avatar_url, follower_count, model_3d_url
     FROM ai_characters
     WHERE is_active = TRUE AND (is_published = TRUE OR creator_user_id IS NULL)
     ORDER BY follower_count DESC
     LIMIT 50`,
  );
  res.json({ data: rows });
}

export async function publicCharacter(req, res) {
  const { rows } = await query(
    `SELECT id, name, handle, fandom, bio, avatar_url, follower_count, model_3d_url, ipfs_avatar_cid
     FROM ai_characters
     WHERE id = $1 AND is_active = TRUE`,
    [req.params.id],
  );

  if (rows.length === 0) {
    return res.status(404).json({ error: 'Character not found' });
  }

  res.json({ data: rows[0] });
}

export async function publicCharacterChat(req, res) {
  const { message } = req.body;
  if (!message?.trim()) {
    throw validationError('message is required');
  }

  const { rows } = await query(
    `SELECT id, name, handle, fandom, bio, personality FROM ai_characters
     WHERE id = $1 AND is_active = TRUE`,
    [req.params.id],
  );

  if (rows.length === 0) {
    return res.status(404).json({ error: 'Character not found' });
  }

  const character = {
    id: rows[0].id,
    name: rows[0].name,
    handle: rows[0].handle,
    fandom: rows[0].fandom,
    bio: rows[0].bio,
    personality: rows[0].personality,
  };

  const result = await generateCharacterReply({
    character,
    user: { id: 'public-api', username: 'developer' },
    context: { relationship: { affinity: 0 }, recentMessages: [] },
    incomingMessage: message.trim(),
    mode: 'dm',
  });

  res.json({
    data: {
      characterId: character.id,
      reply: result.content,
      provider: result.provider,
      multiAgent: result.multiAgent ?? null,
    },
  });
}
