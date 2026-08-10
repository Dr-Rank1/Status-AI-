/**
 * Extracts high-quality user↔AI dialogue from dm_messages and posts for Llama 3 fine-tuning.
 */

import fs from 'fs/promises';
import path from 'path';
import { query } from '../../config/database.js';
import { scrubBatch } from './piiScrubber.js';
import { logger } from '../../utils/logger.js';

const OUTPUT_DIR = process.env.FINE_TUNING_OUTPUT_DIR
  ?? path.join(process.cwd(), 'data', 'fine-tuning');

export async function extractDmDialoguePairs({ limit = 5000 } = {}) {
  const { rows } = await query(
    `SELECT
       c.name AS character_name,
       c.personality,
       c.fandom,
       m_char.content AS assistant_content,
       m_user.content AS user_content
     FROM dm_messages m_char
     JOIN dm_messages m_user
       ON m_user.thread_id = m_char.thread_id
       AND m_user.sender_type = 'user'
       AND m_user.created_at > m_char.created_at
       AND m_user.created_at < m_char.created_at + INTERVAL '24 hours'
     JOIN dm_threads t ON t.id = m_char.thread_id
     JOIN ai_characters c ON c.id = t.character_id
     WHERE m_char.sender_type = 'character'
       AND COALESCE(m_char.is_encrypted, FALSE) = FALSE
       AND COALESCE(m_user.is_encrypted, FALSE) = FALSE
       AND length(m_char.content) >= 12
       AND length(m_user.content) >= 4
     ORDER BY m_char.created_at DESC
     LIMIT $1`,
    [limit],
  );

  return rows.map((row) => formatDialogueRecord(row));
}

export async function extractPostReplyPairs({ limit = 2000 } = {}) {
  const { rows } = await query(
    `SELECT
       c.name AS character_name,
       c.personality,
       c.fandom,
       parent.content AS post_content,
       reply.content AS user_reply,
       char_reply.content AS assistant_content
     FROM posts parent
     JOIN posts reply ON reply.parent_post_id = parent.id AND reply.author_user_id IS NOT NULL
     JOIN posts char_reply ON char_reply.parent_post_id = parent.id AND char_reply.author_character_id IS NOT NULL
     JOIN ai_characters c ON c.id = char_reply.author_character_id
     WHERE parent.author_character_id IS NOT NULL
       AND char_reply.created_at > reply.created_at
       AND length(char_reply.content) >= 12
     ORDER BY char_reply.created_at DESC
     LIMIT $1`,
    [limit],
  );

  return rows.map((row) => formatPostReplyRecord(row));
}

function systemPrompt({ character_name, personality, fandom }) {
  let traits = '';
  if (personality) {
    const text =
      typeof personality === 'string'
        ? personality
        : JSON.stringify(personality);
    if (text && text !== '{}') traits = ` Personality: ${text}.`;
  }
  return `You are ${character_name}, an AI character in the ${fandom} fandom on Status.${traits} Stay in character.`;
}

function formatDialogueRecord(row) {
  return {
    messages: [
      { role: 'system', content: systemPrompt(row) },
      { role: 'user', content: row.user_content },
      { role: 'assistant', content: row.assistant_content },
    ],
  };
}

function formatPostReplyRecord(row) {
  return {
    messages: [
      { role: 'system', content: systemPrompt(row) },
      { role: 'user', content: `Post: ${row.post_content}\nUser reply: ${row.user_reply}` },
      { role: 'assistant', content: row.assistant_content },
    ],
  };
}

export async function buildFineTuningDataset(options = {}) {
  const dmRecords = await extractDmDialoguePairs(options);
  const postRecords = await extractPostReplyPairs(options);
  const combined = [...dmRecords, ...postRecords];
  return scrubBatch(combined);
}

export async function exportFineTuningJsonl(options = {}) {
  const records = await buildFineTuningDataset(options);
  await fs.mkdir(OUTPUT_DIR, { recursive: true });

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filePath = path.join(OUTPUT_DIR, `llama3-dialogue-${stamp}.jsonl`);
  const lines = records.map((r) => JSON.stringify(r)).join('\n');
  await fs.writeFile(filePath, `${lines}\n`, 'utf8');

  logger.info(`[FineTuning] Exported ${records.length} records → ${filePath}`);
  return { filePath, count: records.length };
}
