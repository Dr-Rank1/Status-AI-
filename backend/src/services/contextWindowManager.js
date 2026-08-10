import { query } from '../config/database.js';

const RECENT_MESSAGE_LIMIT = parseInt(process.env.AI_RECENT_MESSAGES ?? '6', 10);
const SUMMARIZE_THRESHOLD = parseInt(process.env.AI_SUMMARIZE_THRESHOLD ?? '10', 10);
const MAX_SUMMARY_LENGTH = parseInt(process.env.AI_MAX_SUMMARY_CHARS ?? '600', 10);
const NIL_THREAD = '00000000-0000-0000-0000-000000000000';

function extractiveSummary(messages, { userLabel, characterName }) {
  const lines = messages.slice(-20).map((m) => {
    const speaker = m.sender_type === 'user' ? userLabel : characterName;
    const text = m.content.replace(/\s+/g, ' ').trim();
    return `${speaker}: ${text.slice(0, 120)}${text.length > 120 ? '…' : ''}`;
  });

  let summary = lines.join(' | ');
  if (summary.length > MAX_SUMMARY_LENGTH) {
    summary = `${summary.slice(0, MAX_SUMMARY_LENGTH)}…`;
  }
  return summary;
}

async function loadStoredSummary({ userId, characterId, threadId, contextType }) {
  const { rows } = await query(
    `SELECT summary, message_count
     FROM ai_context_summaries
     WHERE user_id = $1
       AND character_id = $2
       AND context_type = $3
       AND COALESCE(thread_id::text, '') = COALESCE($4::text, '')`,
    [userId, characterId, contextType, threadId ?? null]
  );
  return rows[0] ?? null;
}

async function saveSummary({ userId, characterId, threadId, contextType, summary, messageCount }) {
  await query(
    `INSERT INTO ai_context_summaries (user_id, character_id, thread_id, context_type, summary, message_count)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (user_id, character_id, context_type, thread_id)
     DO UPDATE SET
       summary = EXCLUDED.summary,
       message_count = EXCLUDED.message_count,
       updated_at = NOW()`,
    [userId, characterId, threadId ?? null, contextType, summary, messageCount]
  );
}

export async function buildDmContext({ userId, characterId, threadId, userLabel, characterName }) {
  const { rows: allMessages } = await query(
    `SELECT sender_type, content, created_at
     FROM dm_messages
     WHERE thread_id = $1
     ORDER BY created_at ASC`,
    [threadId]
  );

  if (allMessages.length <= RECENT_MESSAGE_LIMIT) {
    return { recentMessages: allMessages, memorySummary: null };
  }

  const recentMessages = allMessages.slice(-RECENT_MESSAGE_LIMIT);
  const olderMessages = allMessages.slice(0, -RECENT_MESSAGE_LIMIT);

  if (olderMessages.length < SUMMARIZE_THRESHOLD - RECENT_MESSAGE_LIMIT) {
    const memorySummary = extractiveSummary(olderMessages, { userLabel, characterName });
    return { recentMessages, memorySummary };
  }

  const stored = await loadStoredSummary({
    userId,
    characterId,
    threadId,
    contextType: 'dm',
  });

  let memorySummary;
  if (stored && stored.message_count >= olderMessages.length) {
    memorySummary = stored.summary;
  } else {
    memorySummary = extractiveSummary(olderMessages, { userLabel, characterName });
    await saveSummary({
      userId,
      characterId,
      threadId,
      contextType: 'dm',
      summary: memorySummary,
      messageCount: olderMessages.length,
    });
  }

  return { recentMessages, memorySummary };
}

export async function buildPostReplyContext({ userId, characterId, userLabel, characterName }) {
  const { rows } = await query(
    `SELECT p.content, p.created_at
     FROM posts p
     JOIN posts parent ON p.parent_post_id = parent.id
     WHERE p.author_user_id = $1
       AND parent.author_character_id = $2
     ORDER BY p.created_at DESC
     LIMIT 20`,
    [userId, characterId]
  );

  if (rows.length === 0) {
    return { memorySummary: null, recentInteractions: [] };
  }

  const recentInteractions = rows.slice(0, RECENT_MESSAGE_LIMIT).reverse();
  const older = rows.slice(RECENT_MESSAGE_LIMIT);

  let memorySummary = null;
  if (older.length > 0) {
    const stored = await loadStoredSummary({
      userId,
      characterId,
      threadId: NIL_THREAD,
      contextType: 'post_reply',
    });

    if (stored && stored.message_count >= older.length) {
      memorySummary = stored.summary;
    } else {
      const pseudoMessages = older.reverse().map((r) => ({
        sender_type: 'user',
        content: r.content,
      }));
      memorySummary = extractiveSummary(pseudoMessages, { userLabel, characterName });
      await saveSummary({
        userId,
        characterId,
        threadId: NIL_THREAD,
        contextType: 'post_reply',
        summary: memorySummary,
        messageCount: older.length,
      });
    }
  }

  return { memorySummary, recentInteractions };
}
