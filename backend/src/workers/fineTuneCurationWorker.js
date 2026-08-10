/**
 * Phase 30 — Weekly feedback curation worker (anonymized → fine-tune JSONL).
 */

import { curateFeedbackDataset } from '../services/fineTuning/feedbackCurator.js';
import { exportFineTuningJsonl } from '../services/fineTuning/dataExtractor.js';
import { logger } from '../utils/logger.js';

export async function runWeeklyFineTuneCurationWorker() {
  if (process.env.FINE_TUNING_CURATION_ENABLED === 'false') {
    logger.info('[FineTuneCuration] Disabled');
    return { skipped: true };
  }

  const feedback = await curateFeedbackDataset({
    days: parseInt(process.env.FINE_TUNING_CURATION_DAYS ?? '7', 10),
    limit: parseInt(process.env.FINE_TUNING_CURATION_LIMIT ?? '2000', 10),
  });

  let dialogue = null;
  try {
    dialogue = await exportFineTuningJsonl({
      limit: parseInt(process.env.FINE_TUNING_EXPORT_LIMIT ?? '5000', 10),
    });
  } catch (err) {
    logger.warn('[FineTuneCuration] Dialogue export skipped:', err.message);
  }

  return {
    feedback,
    dialogue: dialogue
      ? { count: dialogue.count, filePath: dialogue.filePath }
      : null,
  };
}
