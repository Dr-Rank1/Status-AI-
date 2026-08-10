import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { query } from '../config/database.js';
import { generateGeminiTextPrompt } from './ai/geminiProvider.js';
import { logger } from '../utils/logger.js';
import { UPLOAD_DIR } from '../config/upload.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const IMAGE_GEN_ENABLED = process.env.IMAGE_GEN_ENABLED !== 'false';
const IMAGE_GEN_PROBABILITY = parseFloat(process.env.IMAGE_GEN_PROBABILITY ?? '0.35');

async function generateWithOpenAI(prompt) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY not configured');

  const response = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: process.env.OPENAI_IMAGE_MODEL ?? 'dall-e-3',
      prompt,
      n: 1,
      size: '1024x1024',
      response_format: 'url',
    }),
  });

  if (!response.ok) {
    throw new Error(`OpenAI image error ${response.status}`);
  }

  const data = await response.json();
  const imageUrl = data.data?.[0]?.url;
  if (!imageUrl) throw new Error('No image URL returned');

  const imgResponse = await fetch(imageUrl);
  const buffer = Buffer.from(await imgResponse.arrayBuffer());
  const filename = `ai-${Date.now()}-${Math.random().toString(36).slice(2)}.png`;
  const filepath = path.join(UPLOAD_DIR, filename);
  fs.writeFileSync(filepath, buffer);

  const base = process.env.API_BASE_URL ?? 'http://localhost:3000';
  return `${base}/uploads/${filename}`;
}

async function generateMockImage(character, postContent) {
  const filename = `ai-mock-${Date.now()}.svg`;
  const filepath = path.join(UPLOAD_DIR, filename);
  const hue = (character.name.length * 37) % 360;
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600" viewBox="0 0 800 600">
  <defs>
    <linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:hsl(${hue},60%,25%)"/>
      <stop offset="100%" style="stop-color:hsl(${(hue + 80) % 360},50%,15%)"/>
    </linearGradient>
  </defs>
  <rect width="800" height="600" fill="url(#g)"/>
  <text x="400" y="280" text-anchor="middle" fill="#ffffff" font-size="28" font-family="sans-serif">${character.name}</text>
  <text x="400" y="330" text-anchor="middle" fill="#cccccc" font-size="16" font-family="sans-serif">${postContent.slice(0, 60).replace(/[<>&"]/g, '')}</text>
</svg>`;
  fs.writeFileSync(filepath, svg);
  const base = process.env.API_BASE_URL ?? 'http://localhost:3000';
  return `${base}/uploads/${filename}`;
}

export function shouldGenerateImageForPost() {
  if (!IMAGE_GEN_ENABLED) return false;
  return Math.random() < IMAGE_GEN_PROBABILITY;
}

export async function buildImagePrompt(character, postContent) {
  const personality = character.personality ?? {};
  const traits = Array.isArray(personality.traits) ? personality.traits.join(', ') : '';
  const tone = personality.tone ?? 'atmospheric';

  try {
    const prompt = await generateGeminiTextPrompt({
      system: 'You write concise image generation prompts. Output ONLY the prompt, no quotes.',
      userPrompt: [
        `Character: ${character.name} from "${character.fandom}" fandom.`,
        traits ? `Traits: ${traits}.` : '',
        `Tone: ${tone}.`,
        `Post: "${postContent}"`,
        'Write a single cinematic image prompt (max 80 words) matching this character and post mood.',
      ]
        .filter(Boolean)
        .join('\n'),
      maxTokens: 120,
    });
    return prompt || `${character.name} in ${character.fandom} universe, ${tone} mood: ${postContent.slice(0, 80)}`;
  } catch {
    return `${character.name}, ${character.fandom} fandom, ${tone} aesthetic, social media photo: ${postContent.slice(0, 80)}`;
  }
}

export async function generateCharacterPostImage(character, postContent) {
  const prompt = await buildImagePrompt(character, postContent);
  logger.info(`[ImageGen] Prompt for ${character.handle}: ${prompt.slice(0, 80)}...`);

  try {
    if (process.env.OPENAI_API_KEY) {
      return { imageUrl: await generateWithOpenAI(prompt), prompt, provider: 'openai' };
    }
  } catch (err) {
    logger.warn('[ImageGen] OpenAI failed, using mock:', err.message);
  }

  return { imageUrl: await generateMockImage(character, postContent), prompt, provider: 'mock' };
}

export async function logImageGeneration({ characterId, postId, prompt, provider, imageUrl }) {
  try {
    await query(
      `INSERT INTO analytics_events (event_type, metadata)
       VALUES ('ai_image_generated', $1)`,
      [JSON.stringify({ characterId, postId, prompt, provider, imageUrl })]
    );
  } catch {
    // non-fatal
  }
}
