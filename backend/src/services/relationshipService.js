import { query } from '../config/database.js';
import { analyzeSentiment } from './sentimentService.js';

export async function getRelationship(userId, characterId) {
  const { rows } = await query(
    `SELECT id, affinity, is_following, last_interaction_at
     FROM character_relationships
     WHERE user_id = $1 AND character_id = $2`,
    [userId, characterId]
  );
  return rows[0] ?? { affinity: 0, is_following: false };
}

export async function applyInteraction({
  userId,
  characterId,
  userMessage,
  interactionType = 'dm',
}) {
  const sentiment = analyzeSentiment(userMessage);
  let affinityBonus = sentiment.affinityDelta;

  if (interactionType === 'post_reply') affinityBonus += 1;
  if (interactionType === 'follow') affinityBonus = 5;

  const { rows } = await query(
    `INSERT INTO character_relationships (user_id, character_id, affinity, last_interaction_at)
     VALUES ($1, $2, LEAST(GREATEST($3, -100), 100), NOW())
     ON CONFLICT (user_id, character_id)
     DO UPDATE SET
       affinity = LEAST(GREATEST(character_relationships.affinity + $3, -100), 100),
       last_interaction_at = NOW(),
       updated_at = NOW()
     RETURNING affinity, is_following`,
    [userId, characterId, affinityBonus]
  );

  let reputationDelta = sentiment.reputationDelta;
  if (interactionType === 'post_reply' && sentiment.label === 'positive') {
    reputationDelta += 1;
  }

  let followerDelta = 0;
  if (sentiment.label === 'positive' && rows[0]?.is_following) {
    followerDelta = 1;
  } else if (sentiment.label === 'negative') {
    followerDelta = -1;
  }

  const userUpdate = await query(
    `UPDATE users
     SET reputation = GREATEST(reputation + $1, 0),
         follower_count = GREATEST(follower_count + $2, 0)
     WHERE id = $3
     RETURNING reputation, follower_count`,
    [reputationDelta, followerDelta, userId]
  );

  return {
    affinity: rows[0]?.affinity ?? 0,
    affinityDelta: affinityBonus,
    sentiment: sentiment.label,
    reputation: userUpdate.rows[0]?.reputation ?? 0,
    reputationDelta,
    followerCount: userUpdate.rows[0]?.follower_count ?? 0,
    followerDelta,
  };
}

export async function followCharacter(userId, characterId) {
  const existing = await getRelationship(userId, characterId);

  if (existing.is_following) {
    const { rows } = await query(
      `SELECT reputation, follower_count, following_count FROM users WHERE id = $1`,
      [userId]
    );
    return { isFollowing: true, affinity: existing.affinity ?? 0, user: rows[0] };
  }

  await query(
    `INSERT INTO character_relationships (user_id, character_id, is_following, affinity, last_interaction_at)
     VALUES ($1, $2, TRUE, 5, NOW())
     ON CONFLICT (user_id, character_id)
     DO UPDATE SET is_following = TRUE, updated_at = NOW()`,
    [userId, characterId]
  );

  await query(
    `UPDATE ai_characters SET follower_count = follower_count + 1 WHERE id = $1`,
    [characterId]
  );

  const userUpdate = await query(
    `UPDATE users
     SET following_count = following_count + 1,
         reputation = reputation + 1
     WHERE id = $1
     RETURNING reputation, follower_count, following_count`,
    [userId]
  );

  const rel = await getRelationship(userId, characterId);

  return {
    isFollowing: true,
    affinity: rel.affinity ?? 5,
    user: userUpdate.rows[0],
  };
}

export async function unfollowCharacter(userId, characterId) {
  const existing = await getRelationship(userId, characterId);

  await query(
    `INSERT INTO character_relationships (user_id, character_id, is_following)
     VALUES ($1, $2, FALSE)
     ON CONFLICT (user_id, character_id)
     DO UPDATE SET is_following = FALSE, updated_at = NOW()`,
    [userId, characterId]
  );

  if (existing.is_following) {
    await query(
      `UPDATE ai_characters SET follower_count = GREATEST(follower_count - 1, 0) WHERE id = $1`,
      [characterId]
    );

    await query(
      `UPDATE users SET following_count = GREATEST(following_count - 1, 0) WHERE id = $1`,
      [userId]
    );
  }

  const rel = await getRelationship(userId, characterId);
  const { rows: userRows } = await query(
    `SELECT reputation, follower_count, following_count FROM users WHERE id = $1`,
    [userId]
  );

  return {
    isFollowing: false,
    affinity: rel.affinity ?? 0,
    user: userRows[0],
  };
}

export async function listExploreCharacters(userId) {
  const { rows } = await query(
    `SELECT
       c.id,
       c.name,
       c.handle,
       c.avatar_url,
       c.bio,
       c.fandom,
       c.follower_count,
       c.model_3d_url,
       COALESCE(r.affinity, 0) AS affinity,
       COALESCE(r.is_following, FALSE) AS is_following,
       t.id AS thread_id
     FROM ai_characters c
     LEFT JOIN character_relationships r
       ON r.character_id = c.id AND r.user_id = $1
     LEFT JOIN dm_threads t
       ON t.character_id = c.id AND t.user_id = $1
     WHERE c.is_active = TRUE
       AND (c.is_published = TRUE OR c.creator_user_id IS NULL)
     ORDER BY c.fandom, c.follower_count DESC`,
    [userId]
  );

  const grouped = {};
  for (const row of rows) {
    if (!grouped[row.fandom]) grouped[row.fandom] = [];
    grouped[row.fandom].push(row);
  }

  return { characters: rows, byFandom: grouped };
}
