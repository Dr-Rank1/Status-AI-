/**
 * Self-healing daemon — periodic log inspection and patch evaluation cycle.
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { logger } from '../utils/logger.js';
import { inspectAndHeal, isSelfHealingEnabled } from './selfHealing/selfHealingService.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = process.env.SELF_HEALING_CONFIG
  ?? path.join(__dirname, '../../../deploy/self-healing/daemon.config.json');

let running = false;
let intervalHandle = null;

export async function loadDaemonConfig() {
  try {
    const raw = await fs.readFile(CONFIG_PATH, 'utf8');
    return JSON.parse(raw);
  } catch {
    return { enabled: true, inspectIntervalMs: 60000 };
  }
}

export async function runSelfHealingCycle() {
  if (running) {
    logger.warn('[SelfHealing Daemon] Cycle already running — skipping');
    return null;
  }

  if (!isSelfHealingEnabled()) {
    return { skipped: true, reason: 'disabled' };
  }

  running = true;
  try {
    logger.info('[SelfHealing Daemon] Starting inspection cycle');
    const result = await inspectAndHeal();
    logger.info(`[SelfHealing Daemon] Cycle complete: ${JSON.stringify(result)}`);
    return result;
  } catch (err) {
    logger.error('[SelfHealing Daemon] Cycle failed:', err.message);
    return { error: err.message };
  } finally {
    running = false;
  }
}

export async function startSelfHealingDaemon() {
  const config = await loadDaemonConfig();
  if (config.enabled === false || !isSelfHealingEnabled()) {
    logger.info('[SelfHealing Daemon] Disabled');
    return;
  }

  const intervalMs = config.inspectIntervalMs
    ?? parseInt(process.env.SELF_HEALING_INTERVAL_MS ?? '60000', 10);

  if (intervalHandle) clearInterval(intervalHandle);

  intervalHandle = setInterval(() => {
    runSelfHealingCycle().catch((err) => {
      logger.error('[SelfHealing Daemon] Interval error:', err.message);
    });
  }, intervalMs);

  logger.info(`[SelfHealing Daemon] Started — interval ${intervalMs}ms`);
}

export function stopSelfHealingDaemon() {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
  }
}
