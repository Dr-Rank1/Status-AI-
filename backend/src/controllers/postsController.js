import pool, { query, queryRead } from '../config/database.js';
import { transformFeedMediaUrls } from '../config/cdn.js';
import { readRoutingHeaders } from '../config/geoRouting.js';
import { ENERGY_COSTS, spendEnergy } from '../services/energyService.js';
import { queuePostAiReply } from '../services/messageQueueService.js';
import { notFound, validationError } from '../utils/errors.js';
import { fetchPostById } from '../services/postFormatter.js';
import { emitNewPost } from '../services/socketService.js';
import { getCachedFeed, setCachedFeed, invalidateFeedCache } from '../services/feedCacheService.js';
import { logEvent } from '../services/analyticsService.js';
import { requireContentModeration } from '../middleware/moderation.js';

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

export async function listPosts(req, res) {
  const limit = Math.min(parseInt(req.query.limit ?? '20', 10), 50);
  const offset = parseInt(req.query.offset ?? '0', 10);
  const fandom = req.query.fandom ?? null;

  const cacheParams = { limit, offset, fandom };
  const cached = await getCachedFeed(cacheParams);
  if (cached) {
    return res.json({ ...cached, meta: { ...cached.meta, cached: true } });
  }

  let sql = `${FEED_SELECT} WHERE p.parent_post_id IS NULL`;
  const params = [];

  if (fandom) {
    params.push(fandom);
    sql += ` AND p.fandom = $${params.length}`;
  }

  params.push(limit, offset);
  sql += ` ORDER BY p.created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`;

  const { rows } = await queryRead(sql, params, req);
  const data = rows.map((row) => transformFeedMediaUrls(row));
  const payload = { data, meta: { limit, offset, cached: false, ...readRoutingHeaders(req) } };
  await setCachedFeed(cacheParams, payload);
  res.json(payload);
}

export async function getPost(req, res) {
  const { rows } = await queryRead(`${FEED_SELECT} WHERE p.id = $1`, [req.params.id], req);

  if (rows.length === 0) {
    return res.status(404).json({ error: 'Post not found' });
  }

  res.json({ data: transformFeedMediaUrls(rows[0]) });
}

export async function getPostReplies(req, res) {
  const { rows } = await query(
    `${FEED_SELECT} WHERE p.parent_post_id = $1 ORDER BY p.created_at ASC`,
    [req.params.id]
  );
  res.json({ data: rows });
}

export async function createPost(req, res) {
  const { content, mediaUrls, imageUrl, fandom } = req.body;
  const userId = req.user.id;

  if (!content?.trim()) {
    throw validationError('content is required');
  }

  await requireContentModeration({ userId, text: content, imageUrl: imageUrl ?? null });

  const urls = mediaUrls ?? [];
  const primaryImage = imageUrl ?? (urls.length > 0 ? urls[0] : null);
  const allMedia = primaryImage
    ? [primaryImage, ...urls.filter((u) => u !== primaryImage)]
    : urls;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const energyResult = await spendEnergy(userId, 'post', client);

    const { rows } = await client.query(
      `INSERT INTO posts (author_user_id, content, media_urls, image_url, fandom)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, content, media_urls, image_url, like_count, reply_count, repost_count,
                 fandom, parent_post_id, created_at`,
      [userId, content.trim(), allMedia, primaryImage, fandom ?? 'General']
    );

    await client.query('COMMIT');

    await invalidateFeedCache();
    await logEvent({
      userId,
      eventType: 'energy_spent',
      metadata: { action: 'post', spent: energyResult.spent },
    });

    const feedPost = await fetchPostById(rows[0].id);
    if (feedPost) {
      emitNewPost(feedPost);
    }

    res.status(201).json({
      data: rows[0],
      energy: energyResult.state,
      spent: energyResult.spent,
    });
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function replyToPost(req, res) {
  const { content } = req.body;
  const userId = req.user.id;
  const parentPostId = req.params.id;

  if (!content?.trim()) {
    throw validationError('content is required');
  }

  await requireContentModeration({ userId, text: content });

  const { rows: parentRows } = await query(
    `SELECT id, content, fandom, author_user_id, author_character_id
     FROM posts WHERE id = $1`,
    [parentPostId]
  );

  if (parentRows.length === 0) {
    throw notFound('Post');
  }

  const parent = parentRows[0];
  const client = await pool.connect();

  let userReply;
  let energyResult;

  try {
    await client.query('BEGIN');

    energyResult = await spendEnergy(userId, 'reply', client);

    const inserted = await client.query(
      `INSERT INTO posts (author_user_id, content, fandom, parent_post_id)
       VALUES ($1, $2, $3, $4)
       RETURNING id, content, fandom, parent_post_id, created_at`,
      [userId, content.trim(), parent.fandom ?? 'General', parentPostId]
    );
    userReply = inserted.rows[0];

    await client.query(
      `UPDATE posts SET reply_count = reply_count + 1 WHERE id = $1`,
      [parentPostId]
    );

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    client.release();
    throw err;
  }

  client.release();

  await logEvent({
    userId,
    eventType: 'energy_spent',
    metadata: { action: 'reply', spent: energyResult.spent },
  });

  if (parent.author_character_id) {
    queuePostAiReply({
      user: req.user,
      characterId: parent.author_character_id,
      parentPostId,
      parentPost: parent,
      userReplyContent: content.trim(),
      fandom: parent.fandom,
    });
  }

  const { rows: userRows } = await query(
    `SELECT reputation, follower_count, following_count FROM users WHERE id = $1`,
    [userId]
  );

  res.status(201).json({
    data: userReply,
    aiPending: Boolean(parent.author_character_id),
    energy: energyResult.state,
    spent: energyResult.spent,
    costs: ENERGY_COSTS,
    user: userRows[0] ?? null,
  });
}
