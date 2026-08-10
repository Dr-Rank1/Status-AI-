import fs from 'fs';
import path from 'path';
import { logger } from '../utils/logger.js';

export async function transcribeAudio(filePath, { mimetype } = {}) {
  const apiKey = process.env.OPENAI_API_KEY;

  if (apiKey) {
    try {
      return await transcribeWithWhisper(filePath, apiKey, mimetype);
    } catch (err) {
      logger.warn('[Voice] Whisper failed:', err.message);
    }
  }

  return transcribeMock(filePath);
}

async function transcribeWithWhisper(filePath, apiKey, mimetype) {
  const fileBuffer = fs.readFileSync(filePath);
  const blob = new Blob([fileBuffer], { type: mimetype ?? 'audio/m4a' });
  const form = new FormData();
  form.append('file', blob, path.basename(filePath));
  form.append('model', process.env.WHISPER_MODEL ?? 'whisper-1');
  form.append('language', 'en');

  const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });

  if (!response.ok) {
    throw new Error(`Whisper error ${response.status}: ${await response.text()}`);
  }

  const data = await response.json();
  return {
    text: data.text?.trim() ?? '',
    provider: 'openai-whisper',
  };
}

function transcribeMock(_filePath) {
  const phrases = [
    'Hey, what are you up to today?',
    'I wanted to ask you something important.',
    'That last post was really interesting.',
    'Can we talk about what happened earlier?',
  ];
  const idx = Math.floor(Math.random() * phrases.length);
  return { text: phrases[idx], provider: 'mock-transcribe' };
}

export async function synthesizeSpeech(text, { voice } = {}) {
  const apiKey = process.env.OPENAI_API_KEY;
  const trimmed = text?.trim();
  if (!trimmed) return null;

  if (apiKey) {
    try {
      const response = await fetch('https://api.openai.com/v1/audio/speech', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: process.env.TTS_MODEL ?? 'tts-1',
          input: trimmed.slice(0, 500),
          voice: voice ?? process.env.TTS_VOICE ?? 'nova',
          response_format: 'mp3',
        }),
      });

      if (!response.ok) {
        throw new Error(`TTS error ${response.status}`);
      }

      const buffer = Buffer.from(await response.arrayBuffer());
      return { audio: buffer, contentType: 'audio/mpeg', provider: 'openai-tts' };
    } catch (err) {
      logger.warn('[Voice] TTS failed:', err.message);
    }
  }

  return null;
}
