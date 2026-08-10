import { query } from '../config/database.js';
import { generateCharacterReply } from './ai/index.js';
import { fetchPostById } from './postFormatter.js';
import { emitNewPost } from './socketService.js';
import { invalidateFeedCache } from './feedCacheService.js';
import { logger } from '../utils/logger.js';
import {
  shouldGenerateImageForPost,
  generateCharacterPostImage,
  logImageGeneration,
} from './imageGenerationService.js';

const MIN_HOURS_BETWEEN_POSTS = parseInt(process.env.AI_POST_MIN_HOURS ?? '4', 10);

async function getActiveCharacters() {
  const { rows } = await query(
    `SELECT id, name, handle, avatar_url, bio, fandom, personality, follower_count
     FROM ai_characters
     WHERE is_active = TRUE
     ORDER BY follower_count DESC`
  );
  return rows;
}

async function getAudienceStats(characterId) {
  const { rows } = await query(
    `SELECT
       COUNT(*) FILTER (WHERE is_following) AS follower_count,
       COALESCE(AVG(affinity) FILTER (WHERE is_following), 0) AS avg_affinity,
       COALESCE(MAX(affinity), 0) AS top_affinity
     FROM character_relationships
     WHERE character_id = $1`,
    [characterId]
  );

  const recent = await query(
    `SELECT COUNT(*) AS count
     FROM posts
     WHERE author_character_id = $1
       AND parent_post_id IS NULL
       AND created_at > NOW() - INTERVAL '24 hours'`,
    [characterId]
  );

  return {
    followerCount: parseInt(rows[0]?.follower_count ?? 0, 10),
    avgAffinity: parseFloat(rows[0]?.avg_affinity ?? 0),
    topAffinity: parseInt(rows[0]?.top_affinity ?? 0, 10),
    recentPostCount: parseInt(recent.rows[0]?.count ?? 0, 10),
  };
}

async function shouldPost(characterId) {
  const { rows } = await query(
    `SELECT created_at FROM posts
     WHERE author_character_id = $1 AND parent_post_id IS NULL
     ORDER BY created_at DESC
     LIMIT 1`,
    [characterId]
  );

  if (rows.length === 0) return true;

  const lastPost = new Date(rows[0].created_at);
  const hoursSince = (Date.now() - lastPost.getTime()) / (1000 * 60 * 60);
  return hoursSince >= MIN_HOURS_BETWEEN_POSTS;
}

async function publishCharacterPost(character, content, imageUrl = null) {
  const likeCount = Math.floor(Math.random() * 80) + character.follower_count / 100;
  const media = imageUrl ? [imageUrl] : [];

  const { rows } = await query(
    `INSERT INTO posts (author_character_id, content, fandom, like_count, reply_count, image_url, media_urls)
     VALUES ($1, $2, $3, $4, 0, $5, $6)
     RETURNING id, content, fandom, created_at, image_url`,
    [character.id, content, character.fandom, Math.max(likeCount, 5), imageUrl, media]
  );

  return rows[0];
}

export async function generateAutonomousPostsForAll() {
  const characters = await getActiveCharacters();
  const results = [];

  for (const character of characters) {
    try {
      const eligible = await shouldPost(character.id);
      if (!eligible) {
        results.push({ character: character.handle, skipped: true, reason: 'cooldown' });
        continue;
      }

      const audienceStats = await getAudienceStats(character.id);

      const aiResult = await generateCharacterReply({
        character,
        user: null,
        context: { character, audienceStats, relationship: { affinity: audienceStats.avgAffinity } },
        incomingMessage: null,
        mode: 'autonomous_post',
      });

      if (!aiResult?.content) {
        results.push({ character: character.handle, skipped: true, reason: 'no_content' });
        continue;
      }

      let imageUrl = null;
      let imageMeta = null;

      if (shouldGenerateImageForPost()) {
        try {
          imageMeta = await generateCharacterPostImage(character, aiResult.content);
          imageUrl = imageMeta.imageUrl;
        } catch (err) {
          logger.warn(`[Autonomous] Image gen failed for ${character.handle}:`, err.message);
        }
      }

      const post = await publishCharacterPost(character, aiResult.content, imageUrl);

      if (imageMeta) {
        await logImageGeneration({
          characterId: character.id,
          postId: post.id,
          prompt: imageMeta.prompt,
          provider: imageMeta.provider,
          imageUrl: imageMeta.imageUrl,
        });
      }

      const feedPost = await fetchPostById(post.id);
      if (feedPost) {
        emitNewPost(feedPost);
      }
      await invalidateFeedCache();

      results.push({
        character: character.handle,
        postId: post.id,
        content: post.content,
        imageUrl,
        provider: aiResult.provider,
        imageProvider: imageMeta?.provider ?? null,
      });

      logger.info(`[Autonomous] ${character.handle} posted${imageUrl ? ' with image' : ''}: "${post.content.slice(0, 60)}..."`);
    } catch (err) {
      logger.error(`[Autonomous] Failed for ${character.handle}:`, err.message);
      results.push({ character: character.handle, error: err.message });
    }
  }

  return results;
}

export async function generateAutonomousPostForCharacter(characterId) {
  const { rows } = await query(
    `SELECT id, name, handle, avatar_url, bio, fandom, personality, follower_count
     FROM ai_characters WHERE id = $1 AND is_active = TRUE`,
    [characterId]
  );

  if (rows.length === 0) return null;

  const character = rows[0];
  const audienceStats = await getAudienceStats(character.id);

  const aiResult = await generateCharacterReply({
    character,
    user: null,
    context: { character, audienceStats },
    mode: 'autonomous_post',
  });

  if (!aiResult?.content) return null;

  let imageUrl = null;
  if (shouldGenerateImageForPost()) {
    const imageMeta = await generateCharacterPostImage(character, aiResult.content);
    imageUrl = imageMeta.imageUrl;
  }

  return publishCharacterPost(character, aiResult.content, imageUrl);
}
