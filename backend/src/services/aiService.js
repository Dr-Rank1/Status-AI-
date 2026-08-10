import { query } from '../config/database.js';
import { generateCharacterReply } from './ai/index.js';
import { getRelationship } from './relationshipService.js';
import { buildDmContext, buildPostReplyContext } from './contextWindowManager.js';
import { getActiveGlobalPrompt } from './narrativeEventService.js';
import { contextEngine } from './context/ContextEngine.js';

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
  const userLabel = user.display_name ?? user.username ?? 'Someone';

  const { memorySummary, recentInteractions } = await buildPostReplyContext({
    userId: user.id,
    characterId,
    userLabel,
    characterName: character.name,
  });

  const result = await generateCharacterReply({
    character,
    user,
    context: { character, relationship, parentPost, memorySummary, recentInteractions },
    incomingMessage: userReplyContent,
    mode: 'post_reply',
  });

  return { ...result, character };
}

export async function generateDmReply({
  user,
  characterId,
  threadId,
  userMessageContent,
  affectiveContext = null,
  bciIntent = null,
  req = null,
}) {
  const character = await getCharacter(characterId);
  if (!character) return null;

  const relationship = await getRelationship(user.id, characterId);
  const userLabel = user.display_name ?? user.username ?? 'Someone';

  const { recentMessages, memorySummary } = await buildDmContext({
    userId: user.id,
    characterId,
    threadId,
    userLabel,
    characterName: character.name,
  });

  const globalNarrative = await getActiveGlobalPrompt(character.fandom);

  const enrichedContext = await contextEngine.assembleDmContext({
    user,
    character,
    threadId,
    userMessageContent,
    relationship,
    recentMessages,
    memorySummary,
    globalNarrative,
    affectiveContext,
    bciIntent,
    req,
  });

  const result = await generateCharacterReply({
    character,
    user,
    context: enrichedContext,
    incomingMessage: userMessageContent,
    mode: 'dm',
  });

  return { ...result, character, ragWeights: enrichedContext.ragWeights };
}

export async function generateGroupReply({
  user,
  character,
  groupId,
  userMessageContent,
  recentMessages,
}) {
  const relationship = await getRelationship(user.id, character.id);
  const globalNarrative = await getActiveGlobalPrompt(character.fandom);

  const result = await generateCharacterReply({
    character,
    user,
    context: {
      character,
      relationship,
      recentMessages: recentMessages ?? [],
      globalNarrative,
      groupId,
    },
    incomingMessage: userMessageContent,
    mode: 'group_dm',
  });

  return { ...result, character };
}
