/**
 * Phase 42 — LEO orbital satellite edge mesh routing (extends Phase 41 DTN).
 * Doppler compensation + orbital handover for maritime / remote swarm continuity.
 */

import crypto from 'crypto';
import { logger } from '../../utils/logger.js';
import {
  createBundle,
  transferCustody,
  reconcileDtnState,
  getDtnConfig,
} from '../consensus/dtnBundleProtocol.js';

/** Simplified Keplerian LEO catalog (circular orbits, demo ephemeris). */
const CONSTELLATION = [
  { id: 'leo-alpha', inclinationDeg: 53, altitudeKm: 550, phaseOffsetDeg: 0, groundStations: ['gs-atlantic', 'gs-pacific'] },
  { id: 'leo-beta', inclinationDeg: 53, altitudeKm: 550, phaseOffsetDeg: 120, groundStations: ['gs-atlantic', 'gs-arctic'] },
  { id: 'leo-gamma', inclinationDeg: 97, altitudeKm: 600, phaseOffsetDeg: 240, groundStations: ['gs-pacific', 'gs-equatorial'] },
];

const SPEED_OF_LIGHT_KM_S = 299792.458;
const EARTH_RADIUS_KM = 6371;

/**
 * Approximate satellite elevation / range for a ground node at time t.
 */
export function estimatePassGeometry(sat, { latDeg = 0, lonDeg = 0, atMs = Date.now() } = {}) {
  const periodMin = 90 + (sat.altitudeKm - 550) * 0.05;
  const meanAnomaly = ((atMs / 60000) * (360 / periodMin) + sat.phaseOffsetDeg) % 360;
  const subSatLon = (meanAnomaly + lonDeg) % 360;
  const deltaLon = Math.min(Math.abs(subSatLon - ((lonDeg + 360) % 360)), 180);
  const elevationDeg = Math.max(-5, 70 - deltaLon * 0.8 - Math.abs(latDeg) * 0.1);
  const rangeKm = sat.altitudeKm / Math.sin((Math.max(elevationDeg, 1) * Math.PI) / 180);
  const radialVelocityKmS = Math.sin((meanAnomaly * Math.PI) / 180) * 7.5; // ~LEO orbital speed component
  return {
    satId: sat.id,
    elevationDeg,
    rangeKm,
    radialVelocityKmS,
    visible: elevationDeg > 10,
  };
}

/**
 * Doppler shift compensation factor for RF / optical DTN link.
 * f_recv ≈ f_tx * (1 - v_radial/c)
 */
export function compensateDoppler({
  frequencyHz = 20e9,
  radialVelocityKmS = 0,
} = {}) {
  const beta = radialVelocityKmS / SPEED_OF_LIGHT_KM_S;
  const compensatedHz = frequencyHz * (1 - beta);
  return {
    frequencyHz,
    compensatedHz,
    shiftHz: compensatedHz - frequencyHz,
    beta,
  };
}

/**
 * Select best LEO bird + ground station handover candidate.
 */
export function selectOrbitalRoute({
  latDeg = 0,
  lonDeg = 0,
  preferMaritime = false,
  atMs = Date.now(),
} = {}) {
  const scored = CONSTELLATION.map((sat) => {
    const geo = estimatePassGeometry(sat, { latDeg, lonDeg, atMs });
    let score = geo.elevationDeg;
    if (preferMaritime && sat.groundStations.some((g) => g.includes('atlantic') || g.includes('pacific'))) {
      score += 5;
    }
    if (!geo.visible) score -= 100;
    return { sat, geo, score };
  }).sort((a, b) => b.score - a.score);

  const best = scored[0];
  const handover = scored.find((s) => s.sat.id !== best.sat.id && s.geo.visible) ?? null;
  const doppler = compensateDoppler({ radialVelocityKmS: best.geo.radialVelocityKmS });

  return {
    primary: best.sat.id,
    geometry: best.geo,
    groundStation: best.sat.groundStations[0],
    handoverTarget: handover?.sat.id ?? null,
    doppler,
    constellation: scored.map((s) => ({ id: s.sat.id, elevationDeg: s.geo.elevationDeg, visible: s.geo.visible })),
  };
}

/**
 * Sync edge node ↔ LEO ↔ ground via DTN custody (store-and-forward across passes).
 */
export async function syncViaLeoMesh({
  edgeNodeId = 'maritime-1',
  groundNodeId = 'gs-atlantic',
  payload = {},
  latDeg = 0,
  lonDeg = 0,
  connected = true,
} = {}) {
  const route = selectOrbitalRoute({ latDeg, lonDeg, preferMaritime: true });
  const bundle = createBundle({
    sourceNode: edgeNodeId,
    destNode: groundNodeId,
    service: 'leo-mesh',
    payload: {
      type: 'leo_sync',
      route: {
        primary: route.primary,
        groundStation: route.groundStation,
        handoverTarget: route.handoverTarget,
        dopplerShiftHz: route.doppler.shiftHz,
      },
      swarm: payload,
    },
    priority: 3,
    lifetimeSec: parseInt(process.env.LEO_BUNDLE_TTL_SEC ?? '7200', 10),
  });

  // Custody hops: edge → sat → ground
  transferCustody(bundle.primary.bundleId, {
    connected,
    nextHop: route.primary,
  });
  if (connected && route.geometry.visible) {
    transferCustody(bundle.primary.bundleId, {
      connected: true,
      nextHop: route.groundStation,
    });
  }

  let reconcile = null;
  if (connected) {
    reconcile = await reconcileDtnState({ connected: true, nodeId: edgeNodeId });
  }

  logger.info(
    `[LEO] sync ${edgeNodeId} via ${route.primary} elev=${route.geometry.elevationDeg.toFixed(1)}° doppler=${route.doppler.shiftHz.toFixed(0)}Hz`,
  );

  return {
    bundleId: bundle.primary.bundleId,
    route,
    reconcile,
    mode: connected && route.geometry.visible ? 'live_pass' : 'store_and_forward',
  };
}

export function getLeoMeshConfig() {
  return {
    constellation: CONSTELLATION.map((s) => ({
      id: s.id,
      altitudeKm: s.altitudeKm,
      inclinationDeg: s.inclinationDeg,
    })),
    earthRadiusKm: EARTH_RADIUS_KM,
    dtn: getDtnConfig(),
    dopplerDefaultHz: 20e9,
    handover: true,
  };
}
