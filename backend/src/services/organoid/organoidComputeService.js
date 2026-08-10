/**
 * Phase 43 — Node organoid / wetware service (mirrors native organoid_compute_bridge).
 */

import { logger } from '../../utils/logger.js';

const BACKEND = () => (process.env.ORGANOID_BACKEND ?? 'sim').toLowerCase();

/**
 * Map bio-electrical spikes → sparse tensor (channel → accumulated |µV|).
 */
export function spikesToSparse(spikes = []) {
  const acc = new Map();
  for (const s of spikes) {
    const ch = Number(s.channel ?? 0);
    acc.set(ch, (acc.get(ch) ?? 0) + Math.abs(Number(s.amplitude_uv ?? s.amplitude ?? 0)));
  }
  const entries = [...acc.entries()]
    .map(([index, value]) => ({ index, value }))
    .sort((a, b) => a.index - b.index);
  const energyPj = (BACKEND() === 'sim' ? 0.05 : 0.01) * (spikes.length + 1);
  logger.info(`[Organoid] sparse entries=${entries.length} E≈${energyPj.toFixed(3)}pJ`);
  return {
    entries,
    energyPj,
    backend: BACKEND(),
    associative: true,
  };
}

/**
 * Hyper-associative recall over sparse memory bank.
 * bank = array of { entries: [{index,value}] }
 */
export function associativeRecall(queryEntries = [], bank = []) {
  let bestIdx = 0;
  let best = -1;
  for (let i = 0; i < bank.length; i += 1) {
    const vec = bank[i].entries ?? bank[i];
    let score = 0;
    for (const q of queryEntries) {
      for (const b of vec) {
        if (b.index === q.index) score += b.value * q.value;
      }
    }
    if (score > best) {
      best = score;
      bestIdx = i;
    }
  }
  return {
    index: bestIdx,
    score: best,
    energyPj: BACKEND() === 'sim' ? 0.08 : 0.015,
    backend: BACKEND(),
  };
}

export function getOrganoidConfig() {
  return {
    backend: BACKEND(),
    nativePath: 'mobile/native/organoid_compute_bridge',
    header: 'status_organoid.h',
    energyClass: 'sub-picojoule (wetware target)',
    channels: 64,
  };
}
