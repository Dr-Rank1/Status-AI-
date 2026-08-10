/**
 * Phase 43 — Renewable & orbital energy-aware compute routing.
 * Shifts exascale inference / fine-tune workloads across green microgrids + orbital solar.
 */

import { logger } from '../../utils/logger.js';
import { allocateAgentResources } from '../quantum/quantumHybridSolver.js';

const SITES = [
  { id: 'grid-nordic', kind: 'green_microgrid', renewableFraction: 0.92, carbonIntensity: 25, thermalHeadroomC: 40, capacity: 100, orbital: false },
  { id: 'grid-solar-sahara', kind: 'green_microgrid', renewableFraction: 0.88, carbonIntensity: 40, thermalHeadroomC: 25, capacity: 80, orbital: false },
  { id: 'orbital-solar-a', kind: 'orbital_solar', renewableFraction: 1.0, carbonIntensity: 5, thermalHeadroomC: 60, capacity: 40, orbital: true },
  { id: 'orbital-solar-b', kind: 'orbital_solar', renewableFraction: 1.0, carbonIntensity: 5, thermalHeadroomC: 55, capacity: 35, orbital: true },
  { id: 'grid-coal-fallback', kind: 'fallback', renewableFraction: 0.15, carbonIntensity: 600, thermalHeadroomC: 30, capacity: 120, orbital: false },
];

/**
 * Score a site for a workload given live power / carbon / thermal signals.
 */
export function scoreEnergySite(site, {
  powerAvailableMw = site.capacity,
  carbonIntensity = site.carbonIntensity,
  thermalC = 20,
  preferOrbital = false,
} = {}) {
  const renew = site.renewableFraction;
  const carbonPenalty = carbonIntensity / 100;
  const thermalPenalty = Math.max(0, thermalC - site.thermalHeadroomC) * 0.5;
  const powerFactor = Math.min(1, powerAvailableMw / Math.max(site.capacity, 1));
  let score = renew * 40 - carbonPenalty * 10 - thermalPenalty + powerFactor * 20;
  if (preferOrbital && site.orbital) score += 15;
  if (site.kind === 'fallback') score -= 50;
  return score;
}

/**
 * Route workload to best sites; scale swarm density by power availability.
 */
export async function routeEnergyAwareWorkload({
  workload = { type: 'inference', flopsEstimate: 1e12 },
  signals = {},
  preferOrbital = false,
  maxSites = 2,
} = {}) {
  const scored = SITES.map((site) => {
    const sig = signals[site.id] ?? {};
    const powerAvailableMw = sig.powerAvailableMw ?? site.capacity * 0.75;
    const carbonIntensity = sig.carbonIntensity ?? site.carbonIntensity;
    const thermalC = sig.thermalC ?? 22;
    const score = scoreEnergySite(site, {
      powerAvailableMw,
      carbonIntensity,
      thermalC,
      preferOrbital,
    });
    return { site, score, powerAvailableMw };
  }).sort((a, b) => b.score - a.score);

  const selected = scored.filter((s) => s.score > 0).slice(0, maxSites);
  const totalPower = selected.reduce((a, s) => a + s.powerAvailableMw, 0);
  const baselineSwarm = parseInt(process.env.ENERGY_BASELINE_SWARM ?? '8', 10);
  const swarmDensity = Math.max(
    1,
    Math.min(
      64,
      Math.round(baselineSwarm * (totalPower / 100) * (selected[0]?.site.renewableFraction ?? 0.5)),
    ),
  );

  // Optional hybrid allocation of agent slots onto selected sites
  const alloc = await allocateAgentResources({
    agents: Array.from({ length: Math.min(swarmDensity, 8) }, (_, i) => ({
      id: `agent-${i}`,
      load: workload.type === 'finetune' ? 0.9 : 0.4,
      priority: 1,
    })),
    resources: selected.map((s) => ({
      id: s.site.id,
      capacity: s.powerAvailableMw / 10,
      latencyMs: s.site.orbital ? 80 : 20,
    })),
  });

  const plan = {
    workload,
    selected: selected.map((s) => ({
      id: s.site.id,
      kind: s.site.kind,
      score: Number(s.score.toFixed(2)),
      renewableFraction: s.site.renewableFraction,
      carbonIntensity: s.site.carbonIntensity,
      powerAvailableMw: Number(s.powerAvailableMw.toFixed(2)),
    })),
    swarmDensity,
    allocation: alloc.mapping,
    carbonAware: true,
    thermalAware: true,
  };

  logger.info(
    `[EnergyRouter] type=${workload.type} sites=${plan.selected.map((s) => s.id).join(',')} swarm=${swarmDensity}`,
  );
  return plan;
}

export function getEnergyRouterConfig() {
  return {
    sites: SITES.map((s) => ({ id: s.id, kind: s.kind, renewableFraction: s.renewableFraction })),
    baselineSwarm: parseInt(process.env.ENERGY_BASELINE_SWARM ?? '8', 10),
    metrics: ['renewable_fraction', 'carbon_intensity', 'thermal_headroom', 'power_mw'],
  };
}
