import { query } from '../config/database.js';
import { generateDmReply } from './aiService.js';
import { applyInteraction } from './relationshipService.js';
import { fetchPostById } from './postFormatter.js';
import {
  emitNewPost,
  emitNewMessage,
  emitReputationChange,
  emitGroupMessage,
} from './socketService.js';
import { invalidateFeedCache } from './feedCacheService.js';
import { logEvent } from './analyticsService.js';
import { rewardCreatorOnInteraction } from './creatorRewardService.js';
import { generateGroupReply } from './aiService.js';
import { buildGroupContext } from './groupChatService.js';

const pendingThreads = new Set();
const pendingGroups = new Set();
const lastInteractions = new Map();

export function isGroupAiPending(groupId) {
  return pendingGroups.has(groupId);
}

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

      let aiMessage = null;
      if (aiResult?.content) {
        const inserted = await query(
          `INSERT INTO dm_messages (thread_id, sender_type, content)
           VALUES ($1, 'character', $2)
           RETURNING id, sender_type, content, is_read, created_at`,
          [threadId, aiResult.content]
        );
        aiMessage = inserted.rows[0];

        await query(
          `UPDATE dm_threads SET last_message_at = NOW() WHERE id = $1`,
          [threadId]
        );

        emitNewMessage(user.id, {
          threadId,
          characterId,
          characterName: aiResult.character?.name,
          message: aiMessage,
          aiPending: false,
        });

        await logEvent({
          userId: user.id,
          eventType: 'ai_replied',
          metadata: { channel: 'dm', threadId, characterId },
        });

        await rewardCreatorOnInteraction({
          characterId,
          actorUserId: user.id,
          rewardType: 'dm',
        });
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

      const interactionPayload = {
        ...interaction,
        user: userRows[0],
      };

      lastInteractions.set(threadId, interactionPayload);

      emitReputationChange(user.id, {
        reputation: interaction.reputation,
        followerCount: interaction.followerCount,
        affinity: interaction.affinity,
        affinityDelta: interaction.affinityDelta,
        reputationDelta: interaction.reputationDelta,
        characterId,
        threadId,
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
        const inserted = await query(
          `INSERT INTO posts (author_character_id, content, fandom, parent_post_id)
           VALUES ($1, $2, $3, $4)
           RETURNING id`,
          [characterId, aiResult.content, fandom ?? 'General', parentPostId]
        );

        await query(
          `UPDATE posts SET reply_count = reply_count + 1 WHERE id = $1`,
          [parentPostId]
        );

        const feedPost = await fetchPostById(inserted.rows[0].id);
        if (feedPost) {
          emitNewPost(feedPost);
        }

        await invalidateFeedCache();
        await logEvent({
          userId: user.id,
          eventType: 'ai_replied',
          metadata: { channel: 'post_reply', characterId, parentPostId },
        });

        await rewardCreatorOnInteraction({
          characterId,
          actorUserId: user.id,
          rewardType: 'post_reply',
        });
      }

      const interaction = await applyInteraction({
        userId: user.id,
        characterId,
        userMessage: userReplyContent,
        interactionType: 'post_reply',
      });

      emitReputationChange(user.id, {
        reputation: interaction.reputation,
        followerCount: interaction.followerCount,
        affinity: interaction.affinity,
        affinityDelta: interaction.affinityDelta,
        reputationDelta: interaction.reputationDelta,
        characterId,
      });
    } catch (err) {
      console.error('[AI] Async post reply failed:', err.message);
    }
  });
}

export async function queueGroupAiReplies({
  user,
  groupId,
  content,
  mentionedCharacters,
  userMessage,
}) {
  if (pendingGroups.has(groupId) || mentionedCharacters.length === 0) return;

  pendingGroups.add(groupId);

  setImmediate(async () => {
    try {
      const recentMessages = await buildGroupContext(groupId, 15);

      for (const character of mentionedCharacters) {
        const aiResult = await generateGroupReply({
          user,
          character,
          groupId,
          userMessageContent: content,
          recentMessages,
        });

        if (!aiResult?.content) continue;

        const inserted = await query(
          `INSERT INTO group_messages (group_id, sender_type, sender_character_id, content)
           VALUES ($1, 'character', $2, $3)
           RETURNING id, sender_type, sender_user_id, sender_character_id, content, created_at`,
          [groupId, character.id, aiResult.content]
        );

        await query(`UPDATE group_threads SET last_message_at = NOW() WHERE id = $1`, [groupId]);

        emitGroupMessage(groupId, {
          groupId,
          characterId: character.id,
          characterName: character.name,
          characterHandle: character.handle,
          message: inserted.rows[0],
          aiPending: false,
        });

        await rewardCreatorOnInteraction({
          characterId: character.id,
          actorUserId: user.id,
          rewardType: 'dm',
        });

        await logEvent({
          userId: user.id,
          eventType: 'ai_replied',
          metadata: { channel: 'group', groupId, characterId: character.id },
        });
      }
    } catch (err) {
      console.error('[AI] Group reply failed:', err.message);
    } finally {
      pendingGroups.delete(groupId);
    }
  });
}
