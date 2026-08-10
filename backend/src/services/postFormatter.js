import { query } from '../config/database.js';

const FEED_SELECT = `
  SELECT
    p.id,
    p.content,
    p.media_urls,
    p.image_url,
    p.like_count,
    p.reply_count,
    p.repost_count,
    p.fandom,
    p.parent_post_id,
    p.created_at,
    u.id   AS author_user_id,
    u.display_name AS author_user_name,
    u.username AS author_user_username,
    u.avatar_url   AS author_user_avatar,
    c.id   AS author_character_id,
    c.name AS author_character_name,
    c.handle AS author_character_handle,
    c.avatar_url AS author_character_avatar
  FROM posts p
  LEFT JOIN users u ON p.author_user_id = u.id
  LEFT JOIN ai_characters c ON p.author_character_id = c.id
`;

export async function fetchPostById(postId) {
  const { rows } = await query(`${FEED_SELECT} WHERE p.id = $1`, [postId]);
  return rows[0] ?? null;
}

export { FEED_SELECT };
