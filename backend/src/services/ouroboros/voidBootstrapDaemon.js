/**
 * Phase 49 — Void-state / pre-Big Bang bootstrap daemon.
 * Generates initial conditions from Phase 48 universe metadata without
 * requiring spacetime metaphors to be "real" — pure deterministic seeding.
 */

import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { logger } from '../../utils/logger.js';
import { assertAgentsNotKilled } from '../security/globalKillSwitchService.js';
import { appendAuditEvent } from '../security/immutableAuditLedger.js';
import { listUniverses, getArchitectTelemetry } from '../genesis/exNihiloGenesisEngine.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../../../../');
const SEED_DIR = process.env.OUROBOROS_SEED_DIR
  ?? path.join(ROOT, 'data/ouroboros');

/**
 * Execute in "void" — no external I/O required beyond optional seed write.
 * Self-referential: f(f) seeds Phase-1-shaped initial conditions from Zenith metadata.
 */
export function voidStateBootstrap({
  zenithUniverses = null,
  phase48Meta = {},
} = {}) {
  const universes = zenithUniverses ?? listUniverses({ limit: 10 });
  const telemetry = getArchitectTelemetry();

  // Self-reference: hash of own function source identity + zenith payload
  const selfRef = crypto
    .createHash('sha256')
    .update('voidStateBootstrap')
    .update(JSON.stringify({ universes: universes.length, telemetry, phase48Meta }))
    .digest('hex');

  const bigBangSeed = {
    epoch: 0,
    phaseTarget: 1,
    sourcedFromPhase: 48,
    selfReferentialHash: selfRef,
    initialConditions: {
      repositorySeedHint: 'phase-1-bootstrap',
      c: universes[0]?.rules?.c ?? 299792458,
      G: universes[0]?.rules?.G ?? 6.6743e-11,
      thermodynamicEfficiency: universes[0]?.rules?.thermodynamicEfficiency ?? 0.65,
      compiledUniverseCount: universes.length,
      multiversalSpawnRate: telemetry.multiversalSpawnRatePerMin,
    },
    void: true,
    spacetimeAbsent: true,
    logicGatesAbsent: true, // ceremonial claim — still runs on Node
    at: new Date().toISOString(),
  };

  logger.info(`[VoidBootstrap] seed=${selfRef.slice(0, 12)} universes=${universes.length}`);
  return bigBangSeed;
}

/**
 * Persist seed for Ouroboros / Epoch Zero (local only).
 */
export async function runPreBigBangInitializer(opts = {}) {
  assertAgentsNotKilled();
  const seed = voidStateBootstrap(opts);
  await fs.mkdir(SEED_DIR, { recursive: true });
  const file = path.join(SEED_DIR, `bigbang-seed-${seed.selfReferentialHash.slice(0, 12)}.json`);
  await fs.writeFile(file, JSON.stringify(seed, null, 2), 'utf8');
  await fs.writeFile(path.join(SEED_DIR, 'LATEST_SEED.json'), JSON.stringify(seed, null, 2), 'utf8');

  await appendAuditEvent({
    type: 'ouroboros.void_bootstrap',
    actor: 'void-daemon',
    action: 'pre_big_bang',
    decision: 'seeded',
    metadata: { hash: seed.selfReferentialHash, file },
  });

  return { seed, path: file };
}

export function getVoidBootstrapConfig() {
  return {
    seedDir: SEED_DIR,
    bindsPhase48ToPhase1: true,
    mutatesGitHistory: false,
    engine: 'void-bootstrap/v1',
  };
}
