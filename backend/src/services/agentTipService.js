/**
 * Autonomous tipping — characters reward high-engagement user content.
 */

import { query } from '../config/database.js';
import { tipUser, getOrCreateWallet } from './agentWalletService.js';
import { logger } from '../utils/logger.js';

const MIN_LIKES = parseInt(process.env.AGENT_TIP_MIN_LIKES ?? '5', 10);
const MIN_REPLIES = parseInt(process.env.AGENT_TIP_MIN_REPLIES ?? '3', 10);
const TIP_ENERGY = parseInt(process.env.AGENT_TIP_ENERGY ?? '8', 10);
const TIP_TOKEN = parseInt(process.env.AGENT_TIP_TOKEN ?? '2', 10);

export function isHighEngagementPost(post) {
  const likes = post.like_count ?? 0;
  const replies = post.reply_count ?? 0;
  return likes >= MIN_LIKES || replies >= MIN_REPLIES;
}

export async function evaluatePostForTips(postId) {
  const { rows } = await query(
    `SELECT p.id, p.author_user_id, p.like_count, p.reply_count, p.content,
            p.author_character_id
     FROM posts p
     WHERE p.id = $1 AND p.author_user_id IS NOT NULL`,
    [postId],
  );

  if (rows.length === 0) return null;
  const post = rows[0];
  if (!isHighEngagementPost(post)) return null;

  const characters = await pickTippingCharacters(post);
  const tips = [];

  for (const characterId of characters) {
    const result = await tipUser({
      characterId,
      userId: post.author_user_id,
      energyAmount: TIP_ENERGY,
      tokenAmount: TIP_TOKEN,
      reason: 'high_engagement_post',
      metadata: { postId, likeCount: post.like_count, replyCount: post.reply_count },
    });

    if (result) {
      tips.push({ characterId, ...result });
      logger.info(`[AgentTip] ${characterId} tipped user ${post.author_user_id} +${TIP_ENERGY} energy`);
    }
  }

  return tips.length > 0 ? { postId, tips } : null;
}

export async function evaluateReplyForCommunityObjective({
  userId,
  characterId,
  parentPostId,
  sentimentLabel,
}) {
  if (sentimentLabel !== 'positive') return null;

  await getOrCreateWallet(characterId);

  const { rows } = await query(
    `SELECT COUNT(*)::int AS cnt
     FROM posts
     WHERE parent_post_id = $1 AND author_user_id IS NOT NULL`,
    [parentPostId],
  );

  const replyCount = rows[0]?.cnt ?? 0;
  if (replyCount < 2) return null;

  return tipUser({
    characterId,
    userId,
    energyAmount: Math.min(TIP_ENERGY, 5),
    tokenAmount: 1,
    reason: 'community_objective_reply',
    metadata: { parentPostId, replyCount },
  });
}

async function pickTippingCharacters(post) {
  const { rows } = await query(
    `SELECT c.id
     FROM ai_characters c
     LEFT JOIN agent_wallets w ON w.character_id = c.id
     WHERE c.is_active = TRUE
       AND c.fandom = (
         SELECT COALESCE(fandom, 'General') FROM posts WHERE id = $1
       )
       AND COALESCE(w.energy_pool, $2) >= $3
     ORDER BY RANDOM()
     LIMIT 2`,
    [post.id, parseInt(process.env.AGENT_WALLET_ENERGY_POOL ?? '500', 10), TIP_ENERGY],
  );

  if (rows.length > 0) {
    return rows.map((r) => r.id);
  }

  const { rows: fallback } = await query(
    `SELECT id FROM ai_characters WHERE is_active = TRUE ORDER BY RANDOM() LIMIT 1`,
  );
  return fallback.map((r) => r.id);
}

export async function runPeriodicTipSweep() {
  const { rows } = await query(
    `SELECT id, like_count, reply_count
     FROM posts
     WHERE author_user_id IS NOT NULL
       AND parent_post_id IS NULL
       AND created_at > NOW() - INTERVAL '24 hours'
       AND (like_count >= $1 OR reply_count >= $2)
     ORDER BY like_count + reply_count DESC
     LIMIT 20`,
    [MIN_LIKES, MIN_REPLIES],
  );

  const results = [];
  for (const post of rows) {
    const tip = await evaluatePostForTips(post.id);
    if (tip) results.push(tip);
  }
  return results;
}
