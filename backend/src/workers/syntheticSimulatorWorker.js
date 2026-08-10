/**
 * Continuous synthetic simulator worker — runs persona batches on schedule.
 */

import { logger } from '../utils/logger.js';
import { runSimulationBatch, exportCuratedFineTuningRecords } from '../services/syntheticSimulationService.js';

let running = false;

export async function runSyntheticSimulatorWorker(options = {}) {
  if (running) {
    logger.warn('[Synthetic Worker] Simulation already in progress — skipping');
    return null;
  }

  if (process.env.SYNTHETIC_SIM_ENABLED === 'false') {
    return { skipped: true, reason: 'disabled' };
  }

  running = true;
  try {
    const personaCount = options.personaCount
      ?? parseInt(process.env.SYNTHETIC_PERSONA_COUNT ?? '50', 10);

    logger.info(`[Synthetic Worker] Starting batch — ${personaCount} personas`);
    const result = await runSimulationBatch({ personaCount });

    if (result.blocked) return result;

    const records = await exportCuratedFineTuningRecords({ runId: result.runId, limit: 200 });
    logger.info(
      `[Synthetic Worker] Complete — interactions=${result.interactions} curated=${records.length} drift=${result.driftScore?.toFixed?.(3)}`,
    );

    return { ...result, exportedRecords: records.length };
  } catch (err) {
    logger.error('[Synthetic Worker] Failed:', err.message);
    return { error: err.message };
  } finally {
    running = false;
  }
}
