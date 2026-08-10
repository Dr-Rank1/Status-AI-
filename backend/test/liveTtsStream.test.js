import test from 'node:test';
import assert from 'node:assert/strict';
import { encodePcmChunkForSocket } from '../src/services/liveTtsStreamService.js';

test('encodePcmChunkForSocket base64-encodes PCM chunks for socket emit', () => {
  const buffer = Buffer.from([0x00, 0x01, 0x02, 0x03]);
  const encoded = encodePcmChunkForSocket(buffer, { format: 'pcm16', sampleRate: 16000, index: 2 });

  assert.equal(encoded.format, 'pcm16');
  assert.equal(encoded.sampleRate, 16000);
  assert.equal(encoded.index, 2);
  assert.equal(encoded.audio, buffer.toString('base64'));
});
