import cron from 'node-cron';
import { generateAutonomousPostsForAll } from '../services/autonomousPostService.js';
import {
  regenerateStaleEnergy,
  applyCooldownRegen,
} from '../services/energyRegenService.js';

const CRON_ENABLED = process.env.CRON_ENABLED !== 'false';

const AI_POST_CRON = process.env.AI_POST_CRON ?? '0 */4 * * *';
const ENERGY_DAILY_CRON = process.env.ENERGY_DAILY_CRON ?? '0 0 * * *';
const ENERGY_COOLDOWN_CRON = process.env.ENERGY_COOLDOWN_CRON ?? '0 * * * *';

let jobs = [];

function schedule(name, expression, handler) {
  if (!cron.validate(expression)) {
    console.warn(`[Cron] Invalid expression for ${name}: ${expression}`);
    return null;
  }

  const job = cron.schedule(expression, async () => {
    try {
      await handler();
    } catch (err) {
      console.error(`[Cron] ${name} failed:`, err.message);
    }
  });

  console.log(`[Cron] Scheduled "${name}" → ${expression}`);
  return job;
}

export function startScheduledJobs() {
  if (!CRON_ENABLED) {
    console.log('[Cron] Disabled (CRON_ENABLED=false)');
    return;
  }

  jobs = [
    schedule('autonomous-ai-posts', AI_POST_CRON, async () => {
      const results = await generateAutonomousPostsForAll();
      const posted = results.filter((r) => r.postId).length;
      console.log(`[Cron] Autonomous posts complete: ${posted}/${results.length} characters`);
    }),

    schedule('energy-daily-reset', ENERGY_DAILY_CRON, async () => {
      await regenerateStaleEnergy();
    }),

    schedule('energy-cooldown-tick', ENERGY_COOLDOWN_CRON, async () => {
      await applyCooldownRegen();
    }),
  ].filter(Boolean);

  console.log(`[Cron] ${jobs.length} job(s) active`);
}

export function stopScheduledJobs() {
  for (const job of jobs) {
    job.stop();
  }
  jobs = [];
}
