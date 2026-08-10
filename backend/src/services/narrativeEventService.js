import { query } from '../config/database.js';
import { generateCharacterReply } from './ai/index.js';
import { fetchPostById } from './postFormatter.js';
import { emitNewPost, emitNarrativeEvent } from './socketService.js';
import { invalidateFeedCache } from './feedCacheService.js';
import { logger } from '../utils/logger.js';

const DEFAULT_EVENTS = [
  {
    title: 'Nebula Storm',
    global_prompt:
      'A massive nebula storm has erupted across the Stellar Chronicles universe. Ships are grounded, communications are flickering, and everyone is reacting to the chaos.',
    fandom: 'Stellar Chronicles',
  },
  {
    title: 'Midnight Blackout',
    global_prompt:
      'A city-wide blackout has plunged Shadow District into darkness. Rumors spread fast and tensions are high.',
    fandom: 'Shadow District',
  },
  {
    title: 'Cross-Fandom Summit',
    global_prompt:
      'Leaders from every fandom have announced an unprecedented summit. Characters across all worlds are sharing hot takes and speculation.',
    fandom: null,
  },
];

export async function getActiveGlobalPrompt(fandom = null) {
  try {
    const { rows } = await query(
      `SELECT title, global_prompt, fandom
       FROM narrative_events
       WHERE status = 'active'
         AND (expires_at IS NULL OR expires_at > NOW())
         AND ($1::varchar IS NULL OR fandom IS NULL OR fandom = $1)
       ORDER BY triggered_at DESC
       LIMIT 1`,
      [fandom]
    );
    if (rows.length === 0) return null;
    return rows[0];
  } catch {
    return null;
  }
}

export async function createNarrativeEvent({ title, globalPrompt, fandom, expiresInHours = 24 }) {
  const { rows } = await query(
    `INSERT INTO narrative_events (title, global_prompt, fandom, expires_at)
     VALUES ($1, $2, $3, NOW() + ($4 || ' hours')::interval)
     RETURNING *`,
    [title, globalPrompt, fandom ?? null, expiresInHours]
  );
  return rows[0];
}

export async function triggerRandomNarrativeEvent() {
  const template = DEFAULT_EVENTS[Math.floor(Math.random() * DEFAULT_EVENTS.length)];
  const event = await createNarrativeEvent({
    title: template.title,
    globalPrompt: template.global_prompt,
    fandom: template.fandom,
    expiresInHours: parseInt(process.env.NARRATIVE_EVENT_HOURS ?? '24', 10),
  });

  logger.info(`[Narrative] Event started: "${event.title}" (${event.fandom ?? 'all fandoms'})`);

  emitNarrativeEvent({
    id: event.id,
    title: event.title,
    globalPrompt: event.global_prompt,
    fandom: event.fandom,
  });

  const reactions = await publishCharacterReactions(event);
  return { event, reactions };
}

async function publishCharacterReactions(event) {
  let characterQuery = `
    SELECT id, name, handle, avatar_url, bio, fandom, personality, follower_count
    FROM ai_characters
    WHERE is_active = TRUE AND is_published = TRUE
  `;
  const params = [];

  if (event.fandom) {
    params.push(event.fandom);
    characterQuery += ` AND fandom = $1`;
  }

  characterQuery += ` ORDER BY follower_count DESC LIMIT 12`;

  const { rows: characters } = await query(characterQuery, params);
  const results = [];

  for (const character of characters) {
    try {
      const aiResult = await generateCharacterReply({
        character,
        user: null,
        context: {
          character,
          globalNarrative: event,
          audienceStats: { followerCount: character.follower_count },
        },
        incomingMessage: null,
        mode: 'narrative_reaction',
      });

      if (!aiResult?.content) continue;

      const { rows } = await query(
        `INSERT INTO posts (author_character_id, content, fandom, like_count, reply_count)
         VALUES ($1, $2, $3, $4, 0)
         RETURNING id`,
        [
          character.id,
          aiResult.content,
          character.fandom,
          Math.floor(Math.random() * 60) + 10,
        ]
      );

      const feedPost = await fetchPostById(rows[0].id);
      if (feedPost) emitNewPost(feedPost);

      results.push({ character: character.handle, postId: rows[0].id });
    } catch (err) {
      logger.warn(`[Narrative] Reaction failed for ${character.handle}:`, err.message);
    }
  }

  await invalidateFeedCache();
  logger.info(`[Narrative] ${results.length} character reactions published`);
  return results;
}

export async function expireStaleEvents() {
  await query(
    `UPDATE narrative_events SET status = 'completed'
     WHERE status = 'active' AND expires_at IS NOT NULL AND expires_at <= NOW()`
  );
}
