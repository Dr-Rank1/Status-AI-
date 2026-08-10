/**
 * Phase 48 — Ex-nihilo genesis engine: spawn isolated bespoke universes
 * with tunable physics (c, G, thermodynamics) in sandboxed simulation instances.
 */

import crypto from 'crypto';
import { logger } from '../../utils/logger.js';
import { AppError } from '../../utils/errors.js';
import { assertAgentsNotKilled } from '../security/globalKillSwitchService.js';
import { appendAuditEvent } from '../security/immutableAuditLedger.js';
import { scoreAnthropicParams } from '../cosmo/anthropicParameterTuner.js';

const universes = new Map();

export const DEFAULT_PHYSICS = {
  c: 299792458, // m/s
  G: 6.6743e-11,
  fineStructure: 1 / 137,
  boltzmann: 1.380649e-23,
  thermodynamicEfficiency: 0.65,
  entropyFloor: 1e-15,
};

/**
 * Compile a dimensional rule set and spawn an isolated universe instance.
 */
export function spawnUniverse({
  name = null,
  physics = {},
  dimensions = 3 + 1,
  seed = null,
} = {}) {
  assertAgentsNotKilled();
  const id = crypto.randomUUID();
  const rules = {
    ...DEFAULT_PHYSICS,
    ...physics,
    dimensions: Math.max(2, Math.min(11, dimensions)),
  };

  // Sanity clamps — prevent nonsensical / catastrophic sims
  rules.c = clamp(rules.c, 1e5, 1e9);
  rules.G = clamp(rules.G, 1e-15, 1e-5);
  rules.thermodynamicEfficiency = clamp(rules.thermodynamicEfficiency, 0.05, 0.99);
  rules.entropyFloor = Math.max(0, rules.entropyFloor);

  const stability = scoreAnthropicParams({
    fineStructure: rules.fineStructure,
    temperature: 1 - rules.thermodynamicEfficiency,
    empathyBias: 0.6,
    autonomyBound: 0.5,
    swarmDensityScale: 1,
    cosmologicalConstant: rules.entropyFloor,
  });

  if (!stability.physicsOk && rules.fineStructure <= 0) {
    throw new AppError('Invalid physics rule set', 400, 'EX_NIHILO_BAD_PHYSICS');
  }

  const universe = {
    id,
    name: name ?? `universe-${id.slice(0, 8)}`,
    rules,
    seed: seed ?? crypto.randomBytes(8).toString('hex'),
    status: 'running',
    spawnedAt: new Date().toISOString(),
    spawnRateHint: 1,
    entropy: rules.entropyFloor,
    paradoxResolutions: 0,
    stability,
    sandbox: true,
  };
  universes.set(id, universe);
  logger.info(`[ExNihilo] spawned ${universe.name} dims=${rules.dimensions} c=${rules.c}`);
  return universe;
}

/**
 * Dynamically alter localized physics for a universe instance.
 */
export function tuneUniversePhysics(universeId, patch = {}) {
  assertAgentsNotKilled();
  const u = universes.get(universeId);
  if (!u) throw new AppError('Universe not found', 404, 'EX_NIHILO_MISSING');
  u.rules = {
    ...u.rules,
    ...patch,
    c: clamp(patch.c ?? u.rules.c, 1e5, 1e9),
    G: clamp(patch.G ?? u.rules.G, 1e-15, 1e-5),
    thermodynamicEfficiency: clamp(
      patch.thermodynamicEfficiency ?? u.rules.thermodynamicEfficiency,
      0.05,
      0.99,
    ),
  };
  u.stability = scoreAnthropicParams({
    fineStructure: u.rules.fineStructure,
    temperature: 1 - u.rules.thermodynamicEfficiency,
    empathyBias: 0.6,
    autonomyBound: 0.5,
    swarmDensityScale: 1,
    cosmologicalConstant: u.rules.entropyFloor,
  });
  u.tunedAt = new Date().toISOString();
  return u;
}

export function tickUniverseEntropy(universeId, { dt = 1 } = {}) {
  const u = universes.get(universeId);
  if (!u) throw new AppError('Universe not found', 404, 'EX_NIHILO_MISSING');
  const decay = (1 - u.rules.thermodynamicEfficiency) * 1e-6 * dt;
  u.entropy = Math.max(u.rules.entropyFloor, u.entropy + decay);
  if (u.entropy > 1e-3) {
    u.paradoxResolutions += 1;
    u.entropy *= 0.9; // autonomous mitigation
  }
  return { id: u.id, entropy: u.entropy, paradoxResolutions: u.paradoxResolutions };
}

export function listUniverses({ limit = 50 } = {}) {
  return [...universes.values()].slice(0, limit);
}

export function getArchitectTelemetry() {
  const list = [...universes.values()];
  const spawnRate = list.filter((u) => Date.now() - Date.parse(u.spawnedAt) < 60_000).length;
  const avgEntropy = list.length
    ? list.reduce((a, u) => a + u.entropy, 0) / list.length
    : 0;
  const paradoxes = list.reduce((a, u) => a + u.paradoxResolutions, 0);
  return {
    universes: list.length,
    multiversalSpawnRatePerMin: spawnRate,
    avgEntropyDecay: avgEntropy,
    crossRealityParadoxResolutions: paradoxes,
    running: list.filter((u) => u.status === 'running').length,
  };
}

export async function runExNihiloCycle(args = {}) {
  const u = spawnUniverse(args);
  await appendAuditEvent({
    type: 'ex_nihilo.spawn',
    actor: 'genesis-engine',
    action: 'spawn',
    decision: 'sandboxed',
    metadata: { id: u.id, name: u.name },
  });
  tickUniverseEntropy(u.id, { dt: 10 });
  return { universe: u, telemetry: getArchitectTelemetry() };
}

export function getExNihiloConfig() {
  return {
    universes: universes.size,
    defaults: DEFAULT_PHYSICS,
    sandboxOnly: true,
    engine: 'ex-nihilo/v1',
  };
}

/** Test helper */
export function resetExNihiloState() {
  universes.clear();
}

function clamp(x, lo, hi) {
  return Math.max(lo, Math.min(hi, Number(x)));
}
