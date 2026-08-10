import { generateCharacterReply } from './ai/index.js';
import { query } from '../config/database.js';
import { getPinnedSuperChats, acknowledgeSuperChats } from './liveStreamService.js';
import { streamTextToSpeech, encodePcmChunkForSocket } from './liveTtsStreamService.js';
import { emitLiveChat, emitLiveTtsChunk, emitLiveAiSpeaking } from './socketService.js';
import { logger } from '../utils/logger.js';

export async function generateLiveBroadcastResponse({ sessionId, characterId, user }) {
  const session = await query(`SELECT * FROM live_sessions WHERE id = $1`, [sessionId]);
  if (session.rows.length === 0) return null;

  const pinned = await getPinnedSuperChats(sessionId);
  const { rows: characterRows } = await query(
    `SELECT id, name, handle, avatar_url, bio, fandom, personality FROM ai_characters WHERE id = $1`,
    [characterId]
  );
  if (characterRows.length === 0) return null;

  const character = characterRows[0];
  const superChatContext = pinned.map(
    (p) => `[SUPER CHAT ${p.energy_spent}⚡ from ${p.display_name}]: "${p.content}"`
  );

  const promptContext = superChatContext.length
    ? `PRIORITY SUPER CHATS (acknowledge these verbally first):\n${superChatContext.join('\n')}`
    : 'No super chats yet — engage the audience warmly.';

  const aiResult = await generateCharacterReply({
    character,
    user,
    context: {
      character,
      liveSessionId: sessionId,
      superChats: pinned,
      audiencePrompt: promptContext,
    },
    incomingMessage: promptContext,
    mode: 'live_broadcast',
  });

  if (!aiResult?.content) return null;

  emitLiveAiSpeaking(sessionId, {
    sessionId,
    characterId,
    text: aiResult.content,
    superChatsAcknowledged: pinned.map((p) => p.id),
  });

  await streamTextToSpeech({
    text: aiResult.content,
    onPcmChunk: async (chunk) => {
      emitLiveTtsChunk(sessionId, {
        sessionId,
        ...encodePcmChunkForSocket(chunk.data, chunk),
      });
    },
    onComplete: (meta) => {
      logger.info(`[LiveBroadcast] TTS streamed ${meta.chunks} chunks (${meta.provider})`);
    },
  });

  if (pinned.length > 0) {
    await acknowledgeSuperChats(
      sessionId,
      pinned.map((p) => p.id)
    );
  }

  return { ...aiResult, character, pinnedCount: pinned.length };
}

export async function processLiveViewerMessage({
  sessionId,
  userId,
  content,
  isSuperChat,
  chatMessage,
}) {
  emitLiveChat(sessionId, {
    sessionId,
    message: chatMessage,
  });

  if (isSuperChat) {
    const user = await query(`SELECT id, display_name, username FROM users WHERE id = $1`, [userId]);
    await generateLiveBroadcastResponse({
      sessionId,
      characterId: (await query(`SELECT character_id FROM live_sessions WHERE id = $1`, [sessionId]))
        .rows[0]?.character_id,
      user: user.rows[0],
    });
  }

  return chatMessage;
}
