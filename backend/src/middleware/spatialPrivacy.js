import { validationError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';

/** Raw spatial / biometric fields that must NEVER reach the server. */
const FORBIDDEN_SPATIAL_KEYS = new Set([
  'point_cloud',
  'pointCloud',
  'mesh_vertices',
  'meshVertices',
  'depth_map',
  'depthMap',
  'eye_tracking',
  'eyeTracking',
  'gaze_vectors',
  'gazeVectors',
  'pupil_data',
  'pupilData',
  'raw_mapping',
  'rawMapping',
  'scene_reconstruction',
  'sceneReconstruction',
  'lidar_scan',
  'lidarScan',
  'camera_intrinsics',
  'cameraIntrinsics',
]);

const ALLOWED_PROCESSED_FIELDS = new Set([
  'proxemicZone',
  'proxemic_zone',
  'roomType',
  'room_type',
  'lightingLevel',
  'lighting_level',
  'furnitureDensity',
  'furniture_density',
  'ambientMood',
  'ambient_mood',
  'residencyRegion',
  'residency_region',
  'sceneKey',
  'scene_key',
  'anchorLabel',
  'anchor_label',
  'worldPosition',
  'world_position',
  'worldRotation',
  'world_rotation',
  'scale',
  'isPersistent',
  'is_persistent',
  'characterId',
  'character_id',
  'processedOnly',
  'processed_only',
  'timestamp',
]);

function findForbiddenKeys(obj, path = '') {
  const hits = [];
  if (!obj || typeof obj !== 'object') return hits;

  for (const [key, value] of Object.entries(obj)) {
    const fullPath = path ? `${path}.${key}` : key;
    if (FORBIDDEN_SPATIAL_KEYS.has(key)) {
      hits.push(fullPath);
    }
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      hits.push(...findForbiddenKeys(value, fullPath));
    }
  }
  return hits;
}

/**
 * Strip and validate spatial payloads — only processed, bucketed context is allowed.
 */
export function sanitizeSpatialPayload(spatial = {}) {
  const forbidden = findForbiddenKeys(spatial);
  if (forbidden.length > 0) {
    throw validationError(
      `Raw spatial data rejected (${forbidden.join(', ')}). Only processed context buckets are permitted.`
    );
  }

  const out = {};
  for (const [key, value] of Object.entries(spatial)) {
    if (ALLOWED_PROCESSED_FIELDS.has(key)) {
      out[key] = value;
    }
  }

  out.processed_only = true;
  out.processedOnly = true;
  return out;
}

/**
 * Express middleware — enforces on-device-only spatial privacy at the API boundary.
 */
export function spatialPrivacyMiddleware(req, _res, next) {
  try {
    if (req.body?.spatial != null) {
      req.body.spatial = sanitizeSpatialPayload(req.body.spatial);
    }

    if (req.body?.scene?.spatialContext != null) {
      req.body.scene.spatialContext = sanitizeSpatialPayload(req.body.scene.spatialContext);
    }

    if (req.body?.context != null) {
      const forbidden = findForbiddenKeys(req.body.context);
      if (forbidden.length > 0) {
        logger.warn(`[SpatialPrivacy] Blocked raw context keys: ${forbidden.join(', ')}`);
        throw validationError('Raw spatial or eye-tracking data cannot be transmitted to the cloud.');
      }
    }

    next();
  } catch (err) {
    next(err);
  }
}
