import { query } from '../config/database.js';
import { validationError } from '../utils/errors.js';
import { evaluateGeofence, logGeofenceEvent } from './spatialGeofenceService.js';
import { sanitizeSpatialPayload } from '../middleware/spatialPrivacy.js';

const VALID_ZONES = new Set(['intimate', 'personal', 'social', 'public']);
const VALID_LIGHTING = new Set(['dark', 'dim', 'neutral', 'bright']);
const VALID_ROOM_TYPES = new Set(['living', 'bedroom', 'office', 'kitchen', 'outdoor', 'unknown']);
const VALID_FURNITURE = new Set(['sparse', 'moderate', 'dense']);

/**
 * Process bucketed physical context for AI character reactions.
 * Raw mesh / LiDAR / eye-tracking never enters this layer.
 */
export async function ingestProcessedSpatialContext({
  userId,
  characterId,
  sceneId,
  spatial,
  zoneLabel,
  residencyRegion,
}) {
  const cleaned = sanitizeSpatialPayload(spatial ?? {});

  const geofence = evaluateGeofence({
    zoneLabel: zoneLabel ?? cleaned.room_type ?? cleaned.roomType,
    residencyRegion: residencyRegion ?? cleaned.residency_region ?? cleaned.residencyRegion,
    lat: cleaned.lat,
    lng: cleaned.lng,
  });

  if (!geofence.allowed) {
    await logGeofenceEvent({
      userId,
      zoneId: geofence.zoneId ?? 'unknown',
      eventType: 'blocked_upload',
      metadata: { reason: geofence.reason },
    });
    throw validationError(geofence.reason);
  }

  const proxemicZone = normalizeZone(cleaned.proxemic_zone ?? cleaned.proxemicZone ?? 'personal');
  const roomType = normalizeRoom(cleaned.room_type ?? cleaned.roomType);
  const lightingLevel = normalizeLighting(cleaned.lighting_level ?? cleaned.lightingLevel);
  const furnitureDensity = normalizeFurniture(cleaned.furniture_density ?? cleaned.furnitureDensity);
  const ambientMood = (cleaned.ambient_mood ?? cleaned.ambientMood ?? 'neutral').toString().slice(0, 64);

  const { rows } = await query(
    `INSERT INTO spatial_context_snapshots
       (user_id, character_id, scene_id, proxemic_zone, room_type, lighting_level,
        furniture_density, ambient_mood, residency_region, processed_only)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, TRUE)
     RETURNING *`,
    [
      userId,
      characterId ?? null,
      sceneId ?? null,
      proxemicZone,
      roomType,
      lightingLevel,
      furnitureDensity,
      ambientMood,
      geofence.residencyRegion,
    ]
  );

  return {
    snapshot: rows[0],
    aiContext: buildSpatialAiContext(rows[0]),
    geofence,
  };
}

export function buildSpatialAiContext(snapshot) {
  if (!snapshot) return '';
  return [
    'PHYSICAL CONTEXT (processed on-device, bucketed only):',
    `Proxemic zone: ${snapshot.proxemic_zone} — adjust intimacy and volume of response.`,
    snapshot.room_type ? `Room: ${snapshot.room_type}.` : '',
    snapshot.lighting_level ? `Lighting: ${snapshot.lighting_level}.` : '',
    snapshot.furniture_density ? `Furniture density: ${snapshot.furniture_density}.` : '',
    snapshot.ambient_mood ? `Ambient mood: ${snapshot.ambient_mood}.` : '',
    'React naturally to this physical context without mentioning sensors or spatial mapping.',
  ]
    .filter(Boolean)
    .join('\n');
}

export async function getLatestSpatialContext(userId, characterId) {
  const { rows } = await query(
    `SELECT * FROM spatial_context_snapshots
     WHERE user_id = $1 AND ($2::uuid IS NULL OR character_id = $2)
     ORDER BY created_at DESC
     LIMIT 1`,
    [userId, characterId ?? null]
  );
  return rows[0] ?? null;
}

function normalizeZone(value) {
  const z = (value ?? 'personal').toString().toLowerCase();
  return VALID_ZONES.has(z) ? z : 'personal';
}

function normalizeLighting(value) {
  if (!value) return 'neutral';
  const v = value.toString().toLowerCase();
  return VALID_LIGHTING.has(v) ? v : 'neutral';
}

function normalizeRoom(value) {
  if (!value) return 'unknown';
  const v = value.toString().toLowerCase();
  return VALID_ROOM_TYPES.has(v) ? v : 'unknown';
}

function normalizeFurniture(value) {
  if (!value) return 'moderate';
  const v = value.toString().toLowerCase();
  return VALID_FURNITURE.has(v) ? v : 'moderate';
}
