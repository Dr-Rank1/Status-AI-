import cron from 'node-cron';
import { generateAutonomousPostsForAll } from '../services/autonomousPostService.js';
import {
  triggerRandomNarrativeEvent,
  expireStaleEvents,
} from '../services/narrativeEventService.js';
import {
  regenerateStaleEnergy,
  applyCooldownRegen,
} from '../services/energyRegenService.js';
import { runFineTuningExportWorker } from '../workers/fineTuningExportWorker.js';
import { logger } from '../utils/logger.js';

const CRON_ENABLED = process.env.CRON_ENABLED !== 'false';

const AI_POST_CRON = process.env.AI_POST_CRON ?? '0 */4 * * *';
const ENERGY_DAILY_CRON = process.env.ENERGY_DAILY_CRON ?? '0 0 * * *';
const ENERGY_COOLDOWN_CRON = process.env.ENERGY_COOLDOWN_CRON ?? '0 * * * *';

const NARRATIVE_EVENT_CRON = process.env.NARRATIVE_EVENT_CRON ?? '0 12 * * *';
const FINE_TUNING_EXPORT_CRON = process.env.FINE_TUNING_EXPORT_CRON ?? '0 3 * * 0';

let jobs = [];

function schedule(name, expression, handler) {
  if (!cron.validate(expression)) {
    logger.warn(`[Cron] Invalid expression for ${name}: ${expression}`);
    return null;
  }

  const job = cron.schedule(expression, async () => {
    try {
      await handler();
    } catch (err) {
      logger.error(`[Cron] ${name} failed:`, err.message);
    }
  });

  logger.info(`[Cron] Scheduled "${name}" → ${expression}`);
  return job;
}

export function startScheduledJobs() {
  if (!CRON_ENABLED) {
    logger.info('[Cron] Disabled (CRON_ENABLED=false)');
    return;
  }

  jobs = [
    schedule('autonomous-ai-posts', AI_POST_CRON, async () => {
      const results = await generateAutonomousPostsForAll();
      const posted = results.filter((r) => r.postId).length;
      logger.info(`[Cron] Autonomous posts complete: ${posted}/${results.length} characters`);
    }),

    schedule('narrative-events', NARRATIVE_EVENT_CRON, async () => {
      await expireStaleEvents();
      const result = await triggerRandomNarrativeEvent();
      logger.info(`[Cron] Narrative event: ${result.event.title} (${result.reactions.length} reactions)`);
    }),

    schedule('energy-daily-reset', ENERGY_DAILY_CRON, async () => {
      await regenerateStaleEnergy();
    }),

    schedule('energy-cooldown-tick', ENERGY_COOLDOWN_CRON, async () => {
      await applyCooldownRegen();
    }),

    schedule('fine-tuning-export', FINE_TUNING_EXPORT_CRON, async () => {
      const result = await runFineTuningExportWorker();
      if (result) {
        logger.info(`[Cron] Fine-tuning export: ${result.count} records → ${result.filePath}`);
      }
    }),
  ].filter(Boolean);

  logger.info(`[Cron] ${jobs.length} job(s) active`);
}

export function stopScheduledJobs() {
  for (const job of jobs) {
    job.stop();
  }
  jobs = [];
}
