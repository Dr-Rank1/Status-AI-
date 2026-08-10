import { query } from '../config/database.js';
import { logger } from '../utils/logger.js';

const DEFAULT_RESIDENCY = process.env.SPATIAL_DATA_RESIDENCY ?? 'local';

/** Sensitive zones — coordinates are illustrative; override via SPATIAL_SENSITIVE_ZONES JSON env. */
function loadSensitiveZones() {
  try {
    const raw = process.env.SPATIAL_SENSITIVE_ZONES;
    if (raw) return JSON.parse(raw);
  } catch (err) {
    logger.warn('[SpatialGeofence] Invalid SPATIAL_SENSITIVE_ZONES JSON:', err.message);
  }

  return [
    { id: 'bedroom', label: 'Private bedroom', lat: null, lng: null, radiusM: 0, blockSpatialUpload: true },
    { id: 'bathroom', label: 'Bathroom', lat: null, lng: null, radiusM: 0, blockSpatialUpload: true },
    { id: 'medical', label: 'Medical facility', lat: null, lng: null, radiusM: 50, blockSpatialUpload: true },
  ];
}

export function getDataResidencyRegion(userRegion) {
  const allowed = (process.env.SPATIAL_ALLOWED_REGIONS ?? 'local,us,eu').split(',').map((s) => s.trim());
  const region = userRegion ?? DEFAULT_RESIDENCY;
  if (!allowed.includes(region)) {
    return DEFAULT_RESIDENCY;
  }
  return region;
}

/**
 * Evaluate whether spatial context upload is permitted for the user's location/context.
 * Never receives raw mapping — only coarse zone labels from the client.
 */
export function evaluateGeofence({ zoneLabel, residencyRegion, lat, lng }) {
  const zones = loadSensitiveZones();
  const residency = getDataResidencyRegion(residencyRegion);

  if (zoneLabel) {
    const match = zones.find((z) => z.id === zoneLabel || z.label === zoneLabel);
    if (match?.blockSpatialUpload) {
      return {
        allowed: false,
        reason: `Spatial uploads blocked in sensitive zone: ${match.label}`,
        zoneId: match.id,
        residencyRegion: residency,
      };
    }
  }

  if (lat != null && lng != null) {
    for (const zone of zones) {
      if (zone.lat == null || zone.lng == null || !zone.radiusM) continue;
      const dist = haversineM(lat, lng, zone.lat, zone.lng);
      if (dist <= zone.radiusM && zone.blockSpatialUpload) {
        return {
          allowed: false,
          reason: `Within sensitive geofence: ${zone.label}`,
          zoneId: zone.id,
          residencyRegion: residency,
        };
      }
    }
  }

  return { allowed: true, residencyRegion: residency };
}

function haversineM(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export async function logGeofenceEvent({ userId, zoneId, eventType, metadata = {} }) {
  await query(
    `INSERT INTO spatial_geofence_events (user_id, zone_id, event_type, metadata)
     VALUES ($1, $2, $3, $4)`,
    [userId, zoneId, eventType, JSON.stringify(metadata)]
  );
}
