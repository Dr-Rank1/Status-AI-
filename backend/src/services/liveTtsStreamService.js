import { logger } from '../utils/logger.js';
import { synthesizeSpeechPcm16, synthesizeSpeech } from './voiceService.js';

/**
 * Stream LLM text through fast TTS and emit PCM16 chunks to Simli/LiveKit clients.
 */
export async function streamTextToSpeech({
  text,
  onPcmChunk,
  onComplete,
  voice,
}) {
  const trimmed = text?.trim();
  if (!trimmed) {
    onComplete?.({ provider: 'skip-empty' });
    return { provider: 'skip-empty', chunks: 0 };
  }

  const pcmResult = await synthesizeSpeechPcm16(trimmed, { voice });
  if (pcmResult?.audio) {
    const chunkSize = parseInt(process.env.TTS_STREAM_CHUNK_BYTES ?? '4096', 10);
    let offset = 0;
    let chunks = 0;

    while (offset < pcmResult.audio.length) {
      const slice = pcmResult.audio.subarray(offset, offset + chunkSize);
      await onPcmChunk?.({
        data: slice,
        format: 'pcm16',
        sampleRate: pcmResult.sampleRate ?? 16000,
        index: chunks,
      });
      offset += chunkSize;
      chunks += 1;
    }

    onComplete?.({ provider: pcmResult.provider, chunks });
    return { provider: pcmResult.provider, chunks };
  }

  const mp3Result = await synthesizeSpeech(trimmed, { voice });
  if (mp3Result?.audio) {
    await onPcmChunk?.({
      data: mp3Result.audio,
      format: 'mp3',
      sampleRate: 24000,
      index: 0,
    });
    onComplete?.({ provider: mp3Result.provider, chunks: 1 });
    return { provider: mp3Result.provider, chunks: 1, format: 'mp3' };
  }

  logger.warn('[LiveTTS] No audio generated');
  onComplete?.({ provider: 'mock' });
  return { provider: 'mock', chunks: 0 };
}

export function encodePcmChunkForSocket(buffer, meta = {}) {
  return {
    audio: buffer.toString('base64'),
    format: meta.format ?? 'pcm16',
    sampleRate: meta.sampleRate ?? 16000,
    index: meta.index ?? 0,
  };
}
