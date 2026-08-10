/**
 * Phase 44 — Planetary Global Brain telemetry + macro cognitive bandwidth tuning.
 */

import { getCommandCenterSnapshot, recordAllocation } from '../ops/agentCommandCenterService.js';
import { getEnergyRouterConfig } from '../devops/energyAwareWorkloadRouter.js';
import { getLeoMeshConfig } from '../network/leoOrbitalMeshRouter.js';
import { getEntanglementConfig } from '../quantum/entanglementSyncService.js';
import { getContinuityConfig } from '../continuity/interplanetaryContinuity.js';
import { getKillSwitchState } from '../security/globalKillSwitchService.js';
import { logger } from '../../utils/logger.js';

/** Regional cognitive bandwidth allocations (0–1 share of global pool). */
const regionBandwidth = new Map([
  ['na-east', 0.18],
  ['eu-west', 0.16],
  ['ap-south', 0.14],
  ['maritime', 0.12],
  ['orbital', 0.15],
  ['global-reserve', 0.25],
]);

const anomalyHistory = [];

/**
 * Predict regional traffic / socio-economic spikes from lightweight heuristics.
 */
export function predictRegionalSpikes({
  now = Date.now(),
  signals = {},
} = {}) {
  const hour = new Date(now).getUTCHours();
  const predictions = [];

  for (const [region, base] of regionBandwidth) {
    const sig = signals[region] ?? {};
    const trafficGrowth = Number(sig.trafficGrowth ?? 0);
    const anomalyScore = Number(sig.anomalyScore ?? 0);
    // Business-hour + maritime evening + orbital pass heuristics
    let seasonal = 0;
    if (region === 'na-east' && hour >= 13 && hour <= 21) seasonal = 0.15;
    if (region === 'eu-west' && hour >= 8 && hour <= 16) seasonal = 0.12;
    if (region === 'ap-south' && hour >= 2 && hour <= 10) seasonal = 0.12;
    if (region === 'maritime' && (hour >= 18 || hour <= 4)) seasonal = 0.1;
    if (region === 'orbital') seasonal = 0.08;

    const predictedSpike = Math.min(1, base + seasonal + trafficGrowth + anomalyScore * 0.5);
    const urgency = predictedSpike - base;
    if (urgency > 0.05 || anomalyScore > 0.3) {
      predictions.push({
        region,
        predictedLoad: Number(predictedSpike.toFixed(3)),
        urgency: Number(urgency.toFixed(3)),
        anomalyScore,
        reason: anomalyScore > 0.3 ? 'anomaly' : 'predicted_spike',
      });
    }
  }

  return predictions.sort((a, b) => b.urgency - a.urgency);
}

/**
 * Re-allocate cognitive bandwidth toward predicted hot regions (macro heuristic).
 */
export function tuneGlobalBandwidth({ predictions = [], dampening = 0.35 } = {}) {
  if (!predictions.length) {
    return {
      tuned: false,
      allocations: Object.fromEntries(regionBandwidth),
    };
  }

  const reserve = regionBandwidth.get('global-reserve') ?? 0.25;
  let pool = reserve * dampening;
  const next = new Map(regionBandwidth);

  for (const p of predictions.slice(0, 3)) {
    const boost = Math.min(pool, p.urgency * dampening);
    pool -= boost;
    next.set(p.region, Math.min(0.45, (next.get(p.region) ?? 0) + boost));
    recordAllocation({
      agentId: `global-brain:${p.region}`,
      task: `bandwidth_boost:${boost.toFixed(3)}`,
      status: 'macro_tune',
    });
  }
  next.set('global-reserve', Math.max(0.05, (next.get('global-reserve') ?? 0) - (reserve * dampening - pool)));

  // Normalize to ~1.0
  const sum = [...next.values()].reduce((a, b) => a + b, 0) || 1;
  for (const [k, v] of next) {
    next.set(k, Number((v / sum).toFixed(4)));
    regionBandwidth.set(k, next.get(k));
  }

  logger.info(`[GlobalBrain] tuned regions=${predictions.map((p) => p.region).join(',')}`);
  return {
    tuned: true,
    allocations: Object.fromEntries(regionBandwidth),
    predictions,
  };
}

/**
 * Aggregate planetary sentience snapshot for the Global Brain dashboard.
 */
export async function getGlobalBrainSnapshot({ signals = {}, autoTune = true } = {}) {
  const [command, energy, leo, entangle, continuity] = await Promise.all([
    getCommandCenterSnapshot(),
    Promise.resolve(getEnergyRouterConfig()),
    Promise.resolve(getLeoMeshConfig()),
    Promise.resolve(getEntanglementConfig()),
    Promise.resolve(getContinuityConfig()),
  ]);

  const predictions = predictRegionalSpikes({ signals });
  const tuning = autoTune
    ? tuneGlobalBandwidth({ predictions })
    : { tuned: false, allocations: Object.fromEntries(regionBandwidth), predictions };

  if (predictions.some((p) => p.reason === 'anomaly')) {
    anomalyHistory.push({ at: new Date().toISOString(), predictions });
    if (anomalyHistory.length > 50) anomalyHistory.shift();
  }

  return {
    generatedAt: new Date().toISOString(),
    entity: 'planetary-global-brain/v1',
    killSwitch: getKillSwitchState(),
    sentience: {
      swarmAgents: command.swarm?.cards?.length ?? 0,
      a2a: command.swarm?.a2a,
      consensus: command.swarm?.consensus,
      entanglementPairs: entangle.pairs,
      continuityCapsules: continuity.capsules,
      leoConstellation: leo.constellation?.length ?? 0,
      energySites: energy.sites?.length ?? 0,
    },
    regions: tuning.allocations,
    predictions: tuning.predictions ?? predictions,
    macroTune: { tuned: tuning.tuned, dampening: 0.35 },
    observability: command.observability,
    governance: command.governance,
    recentAnomalies: anomalyHistory.slice(-10).reverse(),
  };
}

export function getGlobalBrainConfig() {
  return {
    regions: [...regionBandwidth.keys()],
    autoTune: process.env.GLOBAL_BRAIN_AUTO_TUNE !== 'false',
    entity: 'planetary-global-brain/v1',
  };
}

/** Test helper */
export function resetGlobalBandwidth() {
  regionBandwidth.clear();
  for (const [k, v] of Object.entries({
    'na-east': 0.18,
    'eu-west': 0.16,
    'ap-south': 0.14,
    maritime: 0.12,
    orbital: 0.15,
    'global-reserve': 0.25,
  })) {
    regionBandwidth.set(k, v);
  }
  anomalyHistory.length = 0;
}
