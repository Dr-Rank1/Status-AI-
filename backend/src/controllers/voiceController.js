import fs from 'fs';
import { transcribeAudio, synthesizeSpeech } from '../services/voiceService.js';
import { logEvent } from '../services/analyticsService.js';

export async function transcribe(req, res) {
  if (!req.file) {
    return res.status(400).json({ error: 'No audio file uploaded' });
  }

  try {
    const result = await transcribeAudio(req.file.path, { mimetype: req.file.mimetype });

    await logEvent({
      userId: req.user.id,
      eventType: 'voice_transcribed',
      metadata: { provider: result.provider, length: result.text.length },
    });

    res.json({ data: result });
  } finally {
    fs.unlink(req.file.path, () => {});
  }
}

export async function synthesize(req, res) {
  const { text, voice } = req.body;
  if (!text?.trim()) {
    return res.status(400).json({ error: 'text is required' });
  }

  const result = await synthesizeSpeech(text, { voice });
  if (!result) {
    return res.status(503).json({
      error: 'TTS_UNAVAILABLE',
      message: 'Server TTS unavailable — use client-side TTS',
      data: { text: text.trim() },
    });
  }

  res.set('Content-Type', result.contentType);
  res.send(result.audio);
}
