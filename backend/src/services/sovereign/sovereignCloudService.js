/**
 * Phase 32 — Sovereign cloud data residency isolation.
 * Ensures embeddings / chat / user data stay in legally designated zones (EU, US, APAC).
 */

import { getReadRegion } from '../../config/geoRouting.js';
import { AppError } from '../../utils/errors.js';
import { logger } from '../../utils/logger.js';

export const SOVEREIGN_ZONES = {
  US: {
    id: 'US',
    regions: ['us-east-1', 'us-west-2'],
    countries: ['US', 'CA', 'MX'],
  },
  EU: {
    id: 'EU',
    regions: ['eu-west-1', 'eu-central-1'],
    countries: ['GB', 'DE', 'FR', 'NL', 'IE', 'ES', 'IT', 'SE', 'PL', 'AT', 'BE', 'PT', 'FI', 'DK'],
  },
  APAC: {
    id: 'APAC',
    regions: ['ap-southeast-1', 'ap-northeast-1'],
    countries: ['JP', 'SG', 'AU', 'KR', 'IN', 'HK', 'NZ', 'TW'],
  },
};

const DEFAULT_ZONE = process.env.SOVEREIGN_DEFAULT_ZONE ?? 'US';
const ENFORCE = () => process.env.SOVEREIGN_CLOUD_ENFORCE !== 'false';

export function countryToZone(countryCode) {
  const cc = String(countryCode ?? '').toUpperCase();
  for (const zone of Object.values(SOVEREIGN_ZONES)) {
    if (zone.countries.includes(cc)) return zone.id;
  }
  return DEFAULT_ZONE;
}

export function regionToZone(regionId) {
  const r = String(regionId ?? '');
  for (const zone of Object.values(SOVEREIGN_ZONES)) {
    if (zone.regions.some((x) => r.startsWith(x) || r === x)) return zone.id;
  }
  if (r.startsWith('eu')) return 'EU';
  if (r.startsWith('ap')) return 'APAC';
  if (r.startsWith('us')) return 'US';
  return DEFAULT_ZONE;
}

export function resolveSovereignContext(req) {
  const headerZone = req.headers['x-status-data-residency']
    ?? req.headers['x-data-residency'];
  if (headerZone && SOVEREIGN_ZONES[String(headerZone).toUpperCase()]) {
    return {
      zone: String(headerZone).toUpperCase(),
      source: 'header',
      readRegion: getReadRegion(req),
    };
  }

  const country =
    req.headers['cf-ipcountry']
    ?? req.headers['cloudfront-viewer-country']
    ?? req.headers['x-status-country'];

  const zone = countryToZone(country);
  return {
    zone,
    country: country ? String(country).toUpperCase() : null,
    source: country ? 'geo' : 'default',
    readRegion: getReadRegion(req),
    allowedRegions: SOVEREIGN_ZONES[zone].regions,
  };
}

/**
 * Pre-check before cross-border vector / memory search.
 */
export function assertVectorSearchAllowed({
  queryZone,
  indexZone,
  operation = 'vector_search',
}) {
  if (!ENFORCE()) {
    return { allowed: true, enforced: false };
  }

  const q = String(queryZone ?? DEFAULT_ZONE).toUpperCase();
  const i = String(indexZone ?? q).toUpperCase();

  if (q !== i) {
    const err = new AppError(
      `Sovereign compliance block: ${operation} cannot cross ${q} → ${i}`,
      451,
      'SOVEREIGN_RESIDENCY_VIOLATION',
    );
    err.details = { queryZone: q, indexZone: i, operation };
    throw err;
  }

  return { allowed: true, enforced: true, zone: q };
}

export function filterMemoriesByResidency(memories, zone) {
  if (!ENFORCE() || !Array.isArray(memories)) return memories ?? [];
  return memories.filter((m) => {
    const mz = m.residency_zone ?? m.residencyZone ?? zone;
    return !mz || String(mz).toUpperCase() === String(zone).toUpperCase();
  });
}

export function sovereignMiddleware(req, res, next) {
  const ctx = resolveSovereignContext(req);
  req.sovereign = ctx;
  res.setHeader('X-Status-Data-Residency', ctx.zone);
  if (ctx.allowedRegions) {
    res.setHeader('X-Status-Allowed-Regions', ctx.allowedRegions.join(','));
  }
  next();
}

/**
 * Guard helper for services performing embedding search.
 */
export function guardCrossBorderQuery(req, targetZone) {
  const local = req?.sovereign?.zone ?? DEFAULT_ZONE;
  try {
    return assertVectorSearchAllowed({
      queryZone: local,
      indexZone: targetZone ?? local,
      operation: 'vector_search',
    });
  } catch (err) {
    logger.warn('[Sovereign] blocked cross-border query', err.details ?? {});
    throw err;
  }
}
