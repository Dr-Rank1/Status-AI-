import { query } from '../config/database.js';
import { generateDmReply } from './aiService.js';
import { applyInteraction } from './relationshipService.js';

const pendingThreads = new Set();
const lastInteractions = new Map();

export function isAiPending(threadId) {
  return pendingThreads.has(threadId);
}

export function consumeInteraction(threadId) {
  const data = lastInteractions.get(threadId);
  if (data) lastInteractions.delete(threadId);
  return data;
}

export async function queueDmAiReply({ user, characterId, threadId, userMessageContent }) {
  if (pendingThreads.has(threadId)) return;

  pendingThreads.add(threadId);

  setImmediate(async () => {
    try {
      const aiResult = await generateDmReply({
        user,
        characterId,
        threadId,
        userMessageContent,
      });

      if (aiResult?.content) {
        await query(
          `INSERT INTO dm_messages (thread_id, sender_type, content)
           VALUES ($1, 'character', $2)`,
          [threadId, aiResult.content]
        );

        await query(
          `UPDATE dm_threads SET last_message_at = NOW() WHERE id = $1`,
          [threadId]
        );
      }

      const interaction = await applyInteraction({
        userId: user.id,
        characterId,
        userMessage: userMessageContent,
        interactionType: 'dm',
      });

      const { rows: userRows } = await query(
        `SELECT reputation, follower_count, following_count FROM users WHERE id = $1`,
        [user.id]
      );

      lastInteractions.set(threadId, {
        ...interaction,
        user: userRows[0],
      });
    } catch (err) {
      console.error('[AI] Async DM reply failed:', err.message);
    } finally {
      pendingThreads.delete(threadId);
    }
  });
}

export async function queuePostAiReply({
  user,
  characterId,
  parentPostId,
  parentPost,
  userReplyContent,
  fandom,
}) {
  setImmediate(async () => {
    try {
      const { generatePostReply } = await import('./aiService.js');

      const aiResult = await generatePostReply({
        user,
        characterId,
        parentPost: parentPost,
        userReplyContent,
      });

      if (aiResult?.content) {
        await query(
          `INSERT INTO posts (author_character_id, content, fandom, parent_post_id)
           VALUES ($1, $2, $3, $4)`,
          [characterId, aiResult.content, fandom ?? 'General', parentPostId]
        );

        await query(
          `UPDATE posts SET reply_count = reply_count + 1 WHERE id = $1`,
          [parentPostId]
        );
      }

      await applyInteraction({
        userId: user.id,
        characterId,
        userMessage: userReplyContent,
        interactionType: 'post_reply',
      });
    } catch (err) {
      console.error('[AI] Async post reply failed:', err.message);
    }
  });
}
