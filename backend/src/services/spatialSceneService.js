import { query } from '../config/database.js';
import { validationError } from '../utils/errors.js';
import { sanitizeSpatialPayload } from '../middleware/spatialPrivacy.js';

/**
 * visionOS 26-style persistent spatial scenes — metadata only, no raw mesh.
 * Anchors let AI avatars reappear in the user's workspace across sessions.
 */
export async function upsertSpatialScene({
  userId,
  characterId,
  sceneKey,
  anchorLabel,
  worldPosition = {},
  worldRotation = {},
  scale = 1,
  isPersistent = true,
  spatialContext,
}) {
  if (!characterId || !sceneKey) {
    throw validationError('characterId and sceneKey are required');
  }

  const { rows: chars } = await query(
    `SELECT id, name, handle, spatial_scene_enabled FROM ai_characters WHERE id = $1 AND is_active = TRUE`,
    [characterId]
  );
  if (chars.length === 0) throw validationError('Character not found');
  if (chars[0].spatial_scene_enabled === false) {
    throw validationError('Spatial scenes disabled for this character');
  }

  const cleanedContext = spatialContext ? sanitizeSpatialPayload(spatialContext) : null;

  const { rows } = await query(
    `INSERT INTO spatial_scenes
       (user_id, character_id, scene_key, anchor_label, world_position, world_rotation, scale, is_persistent, last_seen_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())
     ON CONFLICT (user_id, scene_key)
     DO UPDATE SET
       character_id = EXCLUDED.character_id,
       anchor_label = EXCLUDED.anchor_label,
       world_position = EXCLUDED.world_position,
       world_rotation = EXCLUDED.world_rotation,
       scale = EXCLUDED.scale,
       is_persistent = EXCLUDED.is_persistent,
       last_seen_at = NOW(),
       updated_at = NOW()
     RETURNING *`,
    [
      userId,
      characterId,
      sceneKey,
      anchorLabel ?? `${chars[0].name} workspace`,
      JSON.stringify(worldPosition),
      JSON.stringify(worldRotation),
      scale,
      isPersistent,
    ]
  );

  return {
    scene: rows[0],
    character: chars[0],
    spatialContext: cleanedContext,
  };
}

export async function listUserSpatialScenes(userId) {
  const { rows } = await query(
    `SELECT ss.*, c.name AS character_name, c.handle AS character_handle, c.avatar_url
     FROM spatial_scenes ss
     JOIN ai_characters c ON ss.character_id = c.id
     WHERE ss.user_id = $1 AND ss.is_persistent = TRUE
     ORDER BY ss.last_seen_at DESC
     LIMIT 20`,
    [userId]
  );
  return rows;
}

export async function getSpatialScene(userId, sceneKey) {
  const { rows } = await query(
    `SELECT ss.*, c.name AS character_name, c.handle AS character_handle, c.avatar_url, c.model_3d_url
     FROM spatial_scenes ss
     JOIN ai_characters c ON ss.character_id = c.id
     WHERE ss.user_id = $1 AND ss.scene_key = $2`,
    [userId, sceneKey]
  );
  return rows[0] ?? null;
}

export async function deleteSpatialScene(userId, sceneKey) {
  await query(`DELETE FROM spatial_scenes WHERE user_id = $1 AND scene_key = $2`, [userId, sceneKey]);
}
