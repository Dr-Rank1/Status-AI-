import { query } from '../config/database.js';
import { getSessionPayload } from '../services/sessionService.js';

const ACTIVITY_SELECT = `
  SELECT
    p.id,
    p.content,
    p.like_count,
    p.reply_count,
    p.repost_count,
    p.fandom,
    p.parent_post_id,
    p.created_at,
    parent.content AS parent_content,
    pc.name AS parent_character_name,
    pc.handle AS parent_character_handle
  FROM posts p
  LEFT JOIN posts parent ON p.parent_post_id = parent.id
  LEFT JOIN ai_characters pc ON parent.author_character_id = pc.id
`;

export async function getProfile(req, res) {
  const payload = await getSessionPayload(req.user.id);

  if (!payload) {
    return res.status(404).json({ error: 'Profile not found' });
  }

  const { rows: stats } = await query(
    `SELECT
       COUNT(*) FILTER (WHERE parent_post_id IS NULL) AS post_count,
       COUNT(*) FILTER (WHERE parent_post_id IS NOT NULL) AS reply_count
     FROM posts
     WHERE author_user_id = $1`,
    [req.user.id]
  );

  res.json({
    data: {
      ...payload,
      stats: {
        postCount: parseInt(stats[0]?.post_count ?? 0, 10),
        replyCount: parseInt(stats[0]?.reply_count ?? 0, 10),
      },
    },
  });
}

export async function getProfileActivity(req, res) {
  const userId = req.user.id;
  const limit = Math.min(parseInt(req.query.limit ?? '30', 10), 50);
  const offset = parseInt(req.query.offset ?? '0', 10);

  const { rows } = await query(
    `${ACTIVITY_SELECT}
     WHERE p.author_user_id = $1
     ORDER BY p.created_at DESC
     LIMIT $2 OFFSET $3`,
    [userId, limit, offset]
  );

  res.json({ data: rows, meta: { limit, offset } });
}

export async function updateProfile(req, res) {
  const { displayName, bio, avatarUrl } = req.body;
  const userId = req.user.id;

  const { rows } = await query(
    `UPDATE users
     SET display_name = COALESCE($1, display_name),
         bio = COALESCE($2, bio),
         avatar_url = COALESCE($3, avatar_url),
         updated_at = NOW()
     WHERE id = $4
     RETURNING id, username, email, display_name, avatar_url, bio, reputation,
               follower_count, following_count, created_at`,
    [displayName ?? null, bio ?? null, avatarUrl ?? null, userId]
  );

  if (rows.length === 0) {
    return res.status(404).json({ error: 'User not found' });
  }

  res.json({ data: rows[0] });
}
