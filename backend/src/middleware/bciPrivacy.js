/**
 * BCI privacy middleware — blocks raw neural waveforms from reaching the server.
 */

import { validationError } from '../utils/errors.js';

const FORBIDDEN_BCI_KEYS = new Set([
  'eeg_raw',
  'eegRaw',
  'neural_waveform',
  'neuralWaveform',
  'brain_signal',
  'brainSignal',
  'electrode_data',
  'electrodeData',
  'raw_bci',
  'rawBci',
  'fmri_voxels',
  'fmriVoxels',
]);

const ALLOWED_BCI_FIELDS = new Set([
  'valence',
  'arousal',
  'focusLevel',
  'focus_level',
  'intentType',
  'intent_type',
  'characterId',
  'character_id',
  'confidence',
  'processedOnly',
  'processed_only',
  'deviceId',
  'device_id',
]);

export function bciPrivacyMiddleware(req, res, next) {
  if (!req.body || typeof req.body !== 'object') return next();

  for (const key of Object.keys(req.body)) {
    if (FORBIDDEN_BCI_KEYS.has(key)) {
      throw validationError(`Raw BCI field "${key}" must be processed on-device before upload`);
    }
  }

  const nested = req.body.bci ?? req.body.metrics ?? req.body.signals;
  if (nested && typeof nested === 'object') {
    for (const key of Object.keys(nested)) {
      if (FORBIDDEN_BCI_KEYS.has(key)) {
        throw validationError(`Raw BCI nested field "${key}" is not permitted`);
      }
      if (!ALLOWED_BCI_FIELDS.has(key)) {
        throw validationError(`Unexpected BCI field "${key}" — send processed metrics only`);
      }
    }
  }

  req.body.processedOnly = true;
  return next();
}
