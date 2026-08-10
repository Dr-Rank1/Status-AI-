import fs from 'fs';
import { logger } from '../utils/logger.js';
import { query } from '../config/database.js';

const MODERATION_MODEL = process.env.MODERATION_MODEL ?? 'omni-moderation-latest';

const CATEGORY_MESSAGES = {
  harassment: 'harassment or bullying',
  'harassment/threatening': 'threatening harassment',
  hate: 'hateful content',
  'hate/threatening': 'threatening hate speech',
  illicit: 'illicit content',
  'illicit/violent': 'violent illicit content',
  'self-harm': 'self-harm',
  'self-harm/intent': 'self-harm intent',
  'self-harm/instructions': 'self-harm instructions',
  sexual: 'sexual content',
  'sexual/minors': 'content involving minors',
  violence: 'violent content',
  'violence/graphic': 'graphic violence',
};

async function callModerationApi(input) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;

  const response = await fetch('https://api.openai.com/v1/moderations', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ model: MODERATION_MODEL, input }),
  });

  if (!response.ok) {
    throw new Error(`Moderation API error ${response.status}`);
  }

  const data = await response.json();
  return data.results?.[0] ?? null;
}

function extractFlaggedCategories(result) {
  if (!result?.categories) return [];
  return Object.entries(result.categories)
    .filter(([, flagged]) => flagged === true)
    .map(([category]) => category);
}

function buildUserMessage(categories) {
  if (categories.length === 0) {
    return 'Your content was flagged by our safety system. Please revise and try again.';
  }
  const labels = categories
    .map((c) => CATEGORY_MESSAGES[c] ?? c.replace(/_/g, ' '))
    .slice(0, 3);
  return `Your message was blocked due to: ${labels.join(', ')}. Please revise and try again.`;
}

export async function moderateText(text, { userId } = {}) {
  const trimmed = text?.trim();
  if (!trimmed) {
    return { flagged: false, categories: [], provider: 'skip-empty' };
  }

  let result;
  try {
    result = await callModerationApi([{ type: 'text', text: trimmed }]);
  } catch (err) {
    logger.warn('[Moderation] API failed, allowing content:', err.message);
    return { flagged: false, categories: [], provider: 'error-fallback' };
  }

  if (!result) {
    return moderateTextMock(trimmed, { userId });
  }

  const categories = extractFlaggedCategories(result);
  const flagged = result.flagged === true || categories.length > 0;

  await logModeration({ userId, contentType: 'text', flagged, categories });

  return {
    flagged,
    categories,
    message: flagged ? buildUserMessage(categories) : null,
    provider: 'openai-omni',
  };
}

export async function moderateImageUrl(imageUrl, { userId } = {}) {
  if (!imageUrl?.trim()) {
    return { flagged: false, categories: [], provider: 'skip-empty' };
  }

  let result;
  try {
    result = await callModerationApi([{ type: 'image_url', image_url: imageUrl }]);
  } catch (err) {
    logger.warn('[Moderation] Image API failed, allowing:', err.message);
    return { flagged: false, categories: [], provider: 'error-fallback' };
  }

  if (!result) {
    return { flagged: false, categories: [], provider: 'mock' };
  }

  const categories = extractFlaggedCategories(result);
  const flagged = result.flagged === true || categories.length > 0;

  await logModeration({ userId, contentType: 'image', flagged, categories });

  return {
    flagged,
    categories,
    message: flagged ? buildUserMessage(categories) : null,
    provider: 'openai-omni',
  };
}

export async function moderateImageFile(filePath, { userId, mimetype } = {}) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return { flagged: false, categories: [], provider: 'mock' };
  }

  try {
    const buffer = fs.readFileSync(filePath);
    const base64 = buffer.toString('base64');
    const dataUrl = `data:${mimetype ?? 'image/jpeg'};base64,${base64}`;
    return moderateImageUrl(dataUrl, { userId });
  } catch (err) {
    logger.warn('[Moderation] Image file read failed:', err.message);
    return { flagged: false, categories: [], provider: 'error-fallback' };
  }
}

function moderateTextMock(text, { userId }) {
  const blocked = /\b(kill yourself|kys|nazi|child porn)\b/i.test(text);
  const categories = blocked ? ['violence'] : [];
  logModeration({ userId, contentType: 'text', flagged: blocked, categories }).catch(() => {});
  return {
    flagged: blocked,
    categories,
    message: blocked ? buildUserMessage(categories) : null,
    provider: 'mock',
  };
}

async function logModeration({ userId, contentType, flagged, categories }) {
  try {
    await query(
      `INSERT INTO moderation_logs (user_id, content_type, flagged, categories)
       VALUES ($1, $2, $3, $4)`,
      [userId ?? null, contentType, flagged, JSON.stringify(Object.fromEntries(categories.map((c) => [c, true])))]
    );
  } catch {
    // non-fatal when migration not applied
  }
}
