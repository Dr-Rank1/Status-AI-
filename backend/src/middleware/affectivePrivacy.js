/**
 * Blocks raw biometric sensor streams — only processed affective metrics permitted.
 */

import { validationError } from '../utils/errors.js';

const FORBIDDEN_KEYS = new Set([
  'eeg_raw',
  'eegRaw',
  'ppg_waveform',
  'ppgWaveform',
  'facial_landmarks',
  'facialLandmarks',
  'raw_camera_frame',
  'rawCameraFrame',
  'heart_rate_raw',
  'heartRateRaw',
  'voice_pcm',
  'voicePcm',
  'biometric_stream',
  'biometricStream',
]);

const ALLOWED_KEYS = new Set([
  'hrvScore',
  'hrv_score',
  'facialValence',
  'facial_valence',
  'voiceStress',
  'voice_stress',
  'characterId',
  'character_id',
  'confidence',
  'processedOnly',
  'processed_only',
  'deviceId',
  'device_id',
]);

export function affectivePrivacyMiddleware(req, res, next) {
  if (!req.body || typeof req.body !== 'object') return next();

  for (const key of Object.keys(req.body)) {
    if (FORBIDDEN_KEYS.has(key)) {
      throw validationError(`Raw biometric field "${key}" must be processed on-device`);
    }
  }

  const nested = req.body.biometrics ?? req.body.metrics;
  if (nested && typeof nested === 'object') {
    for (const key of Object.keys(nested)) {
      if (FORBIDDEN_KEYS.has(key)) {
        throw validationError(`Raw biometric nested field "${key}" is not permitted`);
      }
      if (!ALLOWED_KEYS.has(key)) {
        throw validationError(`Unexpected biometric field "${key}"`);
      }
    }
  }

  req.body.processedOnly = true;
  return next();
}
