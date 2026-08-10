/**
 * Background worker — exports anonymized JSONL fine-tuning datasets on a schedule.
 */

import { exportFineTuningJsonl } from '../fineTuning/dataExtractor.js';
import { logger } from '../../utils/logger.js';

let running = false;

export async function runFineTuningExportWorker(options = {}) {
  if (running) {
    logger.warn('[FineTuning Worker] Export already in progress — skipping');
    return null;
  }

  if (process.env.FINE_TUNING_EXPORT_ENABLED === 'false') {
    logger.info('[FineTuning Worker] Disabled (FINE_TUNING_EXPORT_ENABLED=false)');
    return null;
  }

  running = true;
  try {
    const result = await exportFineTuningJsonl({
      limit: parseInt(process.env.FINE_TUNING_EXPORT_LIMIT ?? '5000', 10),
      ...options,
    });
    logger.info(`[FineTuning Worker] Complete — ${result.count} records`);
    return result;
  } catch (err) {
    logger.error('[FineTuning Worker] Failed:', err.message);
    throw err;
  } finally {
    running = false;
  }
}
