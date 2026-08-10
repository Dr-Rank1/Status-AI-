/**
 * Multi-region deployment configuration and peer health checks.
 */

import { logger } from '../utils/logger.js';

export const REGION_ID = process.env.REGION_ID ?? 'local';
export const REGION_NAME = process.env.REGION_NAME ?? 'Local Development';

export function getPeerRegions() {
  const raw = process.env.REGION_PEER_URLS ?? '';
  return raw
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const [region, url] = entry.includes('=') ? entry.split('=') : [entry, entry];
      return { region: region.trim(), url: url.trim() };
    });
}

export async function checkPeerRegions(timeoutMs = 3000) {
  const peers = getPeerRegions();
  const results = await Promise.all(
    peers.map(async ({ region, url }) => {
      const healthUrl = url.endsWith('/health/live')
        ? url
        : `${url.replace(/\/$/, '')}/api/v1/health/live`;

      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        const res = await fetch(healthUrl, { signal: controller.signal });
        clearTimeout(timer);
        return { region, url: healthUrl, status: res.ok ? 'ok' : 'degraded', httpStatus: res.status };
      } catch (err) {
        return { region, url: healthUrl, status: 'unreachable', error: err.message };
      }
    }),
  );

  return results;
}

export function regionHeaders() {
  return {
    'X-Status-Region': REGION_ID,
    'X-Status-Region-Name': REGION_NAME,
  };
}

export async function logRegionStartup() {
  const peers = getPeerRegions();
  logger.info(`[Region] Active region: ${REGION_ID} (${REGION_NAME})`);
  if (peers.length > 0) {
    logger.info(`[Region] Peer regions configured: ${peers.map((p) => p.region).join(', ')}`);
  }
}
