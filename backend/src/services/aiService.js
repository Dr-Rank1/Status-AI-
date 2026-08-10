import { query } from '../config/database.js';
import { generateCharacterReply } from './ai/index.js';
import { getRelationship } from './relationshipService.js';

async function getCharacter(characterId) {
  const { rows } = await query(
    `SELECT id, name, handle, avatar_url, bio, fandom, personality
     FROM ai_characters
     WHERE id = $1 AND is_active = TRUE`,
    [characterId]
  );
  return rows[0] ?? null;
}

export async function generatePostReply({ user, characterId, parentPost, userReplyContent }) {
  const character = await getCharacter(characterId);
  if (!character) return null;

  const relationship = await getRelationship(user.id, characterId);

  const result = await generateCharacterReply({
    character,
    user,
    context: { character, relationship, parentPost },
    incomingMessage: userReplyContent,
    mode: 'post_reply',
  });

  return { ...result, character };
}

export async function generateDmReply({ user, characterId, threadId, userMessageContent }) {
  const character = await getCharacter(characterId);
  if (!character) return null;

  const relationship = await getRelationship(user.id, characterId);

  const { rows: recentMessages } = await query(
    `SELECT sender_type, content, created_at
     FROM dm_messages
     WHERE thread_id = $1
     ORDER BY created_at DESC
     LIMIT 12`,
    [threadId]
  );

  const result = await generateCharacterReply({
    character,
    user,
    context: {
      character,
      relationship,
      recentMessages: recentMessages.reverse(),
    },
    incomingMessage: userMessageContent,
    mode: 'dm',
  });

  return { ...result, character };
}
