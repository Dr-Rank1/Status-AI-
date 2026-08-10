import {
  upsertSpatialScene,
  listUserSpatialScenes,
  getSpatialScene,
  deleteSpatialScene,
} from '../services/spatialSceneService.js';
import {
  ingestProcessedSpatialContext,
  getLatestSpatialContext,
  buildSpatialAiContext,
} from '../services/spatialContextService.js';
import { generateCharacterReply } from '../services/ai/index.js';
import { query } from '../config/database.js';
import { validationError } from '../utils/errors.js';

export async function listScenes(req, res) {
  const scenes = await listUserSpatialScenes(req.user.id);
  res.json({ data: scenes });
}

export async function getScene(req, res) {
  const scene = await getSpatialScene(req.user.id, req.params.sceneKey);
  if (!scene) {
    return res.status(404).json({ error: 'Scene not found' });
  }

  const latestContext = await getLatestSpatialContext(req.user.id, scene.character_id);

  res.json({
    data: {
      scene,
      spatialContext: latestContext,
      aiContextPreview: buildSpatialAiContext(latestContext),
    },
  });
}

export async function saveScene(req, res) {
  const { characterId, sceneKey, anchorLabel, worldPosition, worldRotation, scale, isPersistent, spatial } =
    req.body;

  const result = await upsertSpatialScene({
    userId: req.user.id,
    characterId,
    sceneKey: sceneKey ?? `scene-${characterId}`,
    anchorLabel,
    worldPosition,
    worldRotation,
    scale,
    isPersistent,
    spatialContext: spatial,
  });

  res.status(201).json({ data: result });
}

export async function deleteScene(req, res) {
  await deleteSpatialScene(req.user.id, req.params.sceneKey);
  res.json({ data: { deleted: true } });
}

export async function submitContext(req, res) {
  const { characterId, sceneId, spatial, zoneLabel, residencyRegion } = req.body;

  const result = await ingestProcessedSpatialContext({
    userId: req.user.id,
    characterId,
    sceneId,
    spatial,
    zoneLabel,
    residencyRegion,
  });

  res.status(201).json({ data: result });
}

export async function spatialCharacterReact(req, res) {
  const { characterId, message, spatial, sceneKey } = req.body;
  if (!characterId || !message?.trim()) {
    throw validationError('characterId and message are required');
  }

  const contextResult = await ingestProcessedSpatialContext({
    userId: req.user.id,
    characterId,
    spatial,
    zoneLabel: spatial?.room_type ?? spatial?.roomType,
    residencyRegion: spatial?.residency_region ?? spatial?.residencyRegion,
  });

  const { rows: characterRows } = await query(
    `SELECT id, name, handle, avatar_url, bio, fandom, personality FROM ai_characters WHERE id = $1`,
    [characterId]
  );
  if (characterRows.length === 0) {
    return res.status(404).json({ error: 'Character not found' });
  }

  const character = characterRows[0];
  const aiResult = await generateCharacterReply({
    character,
    user: req.user,
    context: {
      character,
      spatialContext: contextResult.aiContext,
      sceneKey,
      proxemicZone: contextResult.snapshot.proxemic_zone,
    },
    incomingMessage: message,
    mode: 'spatial_ambient',
  });

  res.json({
    data: {
      reply: aiResult,
      spatial: contextResult,
    },
  });
}
