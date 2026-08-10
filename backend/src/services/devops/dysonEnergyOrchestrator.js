/**
 * Phase 44 — Dysonian energy orchestration (extends Phase 43 energy router).
 * Hypothetical Dyson-swarm scale telemetry + irradiance-gated pretrain routing.
 */

import { logger } from '../../utils/logger.js';
import {
  scoreEnergySite,
  routeEnergyAwareWorkload,
  getEnergyRouterConfig,
} from '../devops/energyAwareWorkloadRouter.js';

/** Dyson swarm collector segments (hypothetical megastructure). */
export const DYSON_SEGMENTS = [
  { id: 'dyson-ring-1', kind: 'dyson_swarm', renewableFraction: 1, carbonIntensity: 0, thermalHeadroomC: 90, capacity: 5000, orbital: true, irradiancePeak: 1361 },
  { id: 'dyson-ring-2', kind: 'dyson_swarm', renewableFraction: 1, carbonIntensity: 0, thermalHeadroomC: 85, capacity: 4800, orbital: true, irradiancePeak: 1361 },
  { id: 'dyson-statite-a', kind: 'dyson_statite', renewableFraction: 1, carbonIntensity: 0, thermalHeadroomC: 95, capacity: 2000, orbital: true, irradiancePeak: 1361 },
];

/**
 * Solar irradiance factor 0–1 for a collector at time t (simplified).
 */
export function solarIrradianceFactor({
  atMs = Date.now(),
  peakWm2 = 1361,
  observedWm2 = null,
} = {}) {
  if (observedWm2 != null) return Math.min(1, Math.max(0, observedWm2 / peakWm2));
  // Synthetic orbital day
  const phase = ((atMs / 1000) % 5400) / 5400; // ~90 min LEO-ish
  return 0.55 + 0.45 * Math.sin(phase * Math.PI * 2);
}

/**
 * Score Dyson segments with irradiance boost for pretraining workloads.
 */
export function scoreDysonSite(segment, {
  irradiance = 1,
  thermalC = 30,
  powerAvailableMw = segment.capacity * irradiance,
} = {}) {
  const base = scoreEnergySite(segment, {
    powerAvailableMw,
    carbonIntensity: 0,
    thermalC,
    preferOrbital: true,
  });
  return base + irradiance * 25 + (segment.kind === 'dyson_swarm' ? 10 : 5);
}

/**
 * Route heavy LLM pre-training strictly to orbital/Dyson when irradiance maximizes.
 */
export async function routeDysonianWorkload({
  workload = { type: 'pretrain', flopsEstimate: 1e18 },
  signals = {},
  irradianceWm2 = null,
  forceOrbitalPretrain = true,
  maxSites = 2,
} = {}) {
  const irradiance = solarIrradianceFactor({ observedWm2: irradianceWm2 });
  const isPretrain = workload.type === 'pretrain' || workload.type === 'finetune';

  if (isPretrain && forceOrbitalPretrain && irradiance >= parseFloat(process.env.DYSON_IRRADIANCE_MIN ?? '0.7')) {
    const scored = DYSON_SEGMENTS.map((seg) => {
      const sig = signals[seg.id] ?? {};
      const irr = sig.irradiance ?? irradiance;
      const powerAvailableMw = sig.powerAvailableMw ?? seg.capacity * irr;
      return {
        site: seg,
        score: scoreDysonSite(seg, {
          irradiance: irr,
          thermalC: sig.thermalC ?? 28,
          powerAvailableMw,
        }),
        powerAvailableMw,
        irradiance: irr,
      };
    }).sort((a, b) => b.score - a.score);

    const selected = scored.slice(0, maxSites);
    const swarmDensity = Math.min(
      256,
      Math.round(32 * irradiance * selected.length),
    );

    const plan = {
      workload,
      mode: 'dysonian_orbital',
      irradiance,
      irradianceGate: true,
      selected: selected.map((s) => ({
        id: s.site.id,
        kind: s.site.kind,
        score: Number(s.score.toFixed(2)),
        powerAvailableMw: Number(s.powerAvailableMw.toFixed(1)),
        irradiance: Number(s.irradiance.toFixed(3)),
        renewableFraction: 1,
        carbonIntensity: 0,
      })),
      swarmDensity,
      megastructure: true,
      terraform: 'infra/dyson/orbital_pretrain.tf',
      pulumi: 'infra/dyson/Pulumi.yaml',
    };

    logger.info(
      `[Dyson] pretrain → ${plan.selected.map((s) => s.id).join(',')} irr=${irradiance.toFixed(2)} swarm=${swarmDensity}`,
    );
    return plan;
  }

  // Fall through to Phase 43 green/orbital router
  const base = await routeEnergyAwareWorkload({
    workload,
    signals,
    preferOrbital: true,
    maxSites,
  });
  return {
    ...base,
    mode: 'energy_aware_fallback',
    irradiance,
    irradianceGate: false,
    megastructure: false,
  };
}

export function getDysonOrchestrationConfig() {
  return {
    segments: DYSON_SEGMENTS.map((s) => ({ id: s.id, kind: s.kind, capacity: s.capacity })),
    irradianceMin: parseFloat(process.env.DYSON_IRRADIANCE_MIN ?? '0.7'),
    baseEnergy: getEnergyRouterConfig(),
    iaC: ['infra/dyson/orbital_pretrain.tf', 'infra/dyson/Pulumi.yaml'],
  };
}
