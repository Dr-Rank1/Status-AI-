/**
 * Phase 30 — Weekly curation of anonymized feedback → fine-tuning JSONL.
 */

import fs from 'fs/promises';
import path from 'path';
import { query } from '../../config/database.js';
import { scrubBatch } from './piiScrubber.js';
import { logger } from '../../utils/logger.js';

const OUTPUT_DIR = process.env.FINE_TUNING_OUTPUT_DIR
  ?? path.join(process.cwd(), 'data', 'fine-tuning');

/**
 * Pull recent feedback (bug / ai_quality / character) and map to training hints.
 * Messages are PII-scrubbed; never includes encrypted DM content.
 */
export async function curateFeedbackDataset({ days = 7, limit = 2000 } = {}) {
  const { rows } = await query(
    `SELECT id, category, message, created_at
     FROM user_feedback
     WHERE created_at >= NOW() - make_interval(days => $1)
       AND length(message) >= 8
     ORDER BY created_at DESC
     LIMIT $2`,
    [days, limit],
  );

  const records = rows.map((row) => ({
    messages: [
      {
        role: 'system',
        content: 'You are a Status AI character. Improve clarity and stay in character. Avoid policy boilerplate.',
      },
      {
        role: 'user',
        content: `User feedback (${row.category}): ${row.message}`,
      },
      {
        role: 'assistant',
        content: 'Thanks for the feedback — I will adjust tone and accuracy while staying in character.',
      },
    ],
    meta: {
      source: 'user_feedback',
      feedbackId: row.id,
      category: row.category,
      createdAt: row.created_at,
    },
  }));

  const scrubbed = scrubBatch(records);
  await fs.mkdir(OUTPUT_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filePath = path.join(OUTPUT_DIR, `feedback-curated-${stamp}.jsonl`);
  const lines = scrubbed.map((r) => JSON.stringify(r)).join('\n');
  await fs.writeFile(filePath, lines + (lines ? '\n' : ''), 'utf8');

  logger.info(`[FeedbackCurator] Wrote ${scrubbed.length} records → ${filePath}`);
  return { count: scrubbed.length, filePath, days };
}
