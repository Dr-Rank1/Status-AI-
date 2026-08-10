/**
 * Open metaverse export — VRM 1.0 manifests and OpenXR action-set descriptors.
 */

import crypto from 'crypto';
import { query } from '../config/database.js';
import { notFound } from '../utils/errors.js';

export async function buildCharacterVrmManifest(characterId, userId) {
  const character = await loadCharacterForExport(characterId, userId);
  if (!character) throw notFound('Character');

  const memories = await loadCharacterMemories(characterId, userId);

  return {
    specVersion: '1.0',
    format: 'VRM',
    meta: {
      title: character.name,
      author: character.handle,
      version: '1.0.0',
      licenseUrl: 'https://status.app/licenses/character-export',
    },
    humanoid: {
      boneMappings: 'VRM0.x compatible',
      avatarUrl: character.model_3d_url ?? character.avatar_url,
      glbFallback: character.model_3d_url,
    },
    expressions: buildVrmExpressions(character),
    personality: {
      name: character.name,
      bio: character.bio,
      fandom: character.fandom,
      traits: character.personality?.traits ?? [],
      tone: character.personality?.tone ?? 'neutral',
      systemPrompt: character.personality?.system_prompt ?? null,
    },
    memories: memories.map((m) => ({
      id: m.id,
      content: m.content,
      importance: m.importance ?? 0.5,
    })),
    voice: {
      simliFaceId: character.simli_face_id ?? null,
      ttsProvider: 'status-voice-v1',
    },
    firstPerson: {
      lookAtTypeName: 'Bone',
      meshAnnotations: [],
    },
  };
}

export async function buildOpenXrManifest(characterId, userId) {
  const vrm = await buildCharacterVrmManifest(characterId, userId);

  return {
    specVersion: '1.0',
    format: 'OpenXR-Character-Bridge',
    applicationName: 'Status Metaverse Connector',
    actionSets: [
      {
        name: 'character_interaction',
        localizedName: 'Character Interaction',
        priority: 0,
        actions: [
          { name: 'greet', type: 'boolean', localizedName: 'Greet Character' },
          { name: 'follow', type: 'boolean', localizedName: 'Follow Character' },
          { name: 'voice_chat', type: 'boolean', localizedName: 'Voice Chat' },
        ],
      },
      {
        name: 'spatial_navigation',
        localizedName: 'Spatial Navigation',
        priority: 1,
        actions: [
          { name: 'teleport', type: 'pose', localizedName: 'Teleport' },
          { name: 'grab', type: 'float', localizedName: 'Grab' },
        ],
      },
    ],
    character: vrm,
    suggestedBindings: {
      unreal_engine_5: '/Script/StatusMetaverse.StatusCharacterComponent',
      unity: 'Status.Metaverse.CharacterBridge',
    },
  };
}

export async function createMetaverseSyncSession({
  userId,
  characterId,
  engineType = 'generic',
  exportFormat = 'vrm',
}) {
  const syncToken = crypto.randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + 3600_000).toISOString();

  const manifest = exportFormat === 'openxr'
    ? await buildOpenXrManifest(characterId, userId)
    : await buildCharacterVrmManifest(characterId, userId);

  const { rows } = await query(
    `INSERT INTO metaverse_sync_sessions (user_id, character_id, engine_type, export_format, sync_token, manifest, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id, sync_token, expires_at`,
    [userId, characterId, engineType, exportFormat, syncToken, JSON.stringify(manifest), expiresAt],
  );

  return {
    sessionId: rows[0].id,
    syncToken: rows[0].sync_token,
    expiresAt: rows[0].expires_at,
    manifest,
    websocketUrl: `/socket.io?metaverseSync=${syncToken}`,
    restUrl: `/api/v1/metaverse/sync/${syncToken}`,
  };
}

export async function getMetaverseSyncByToken(syncToken) {
  const { rows } = await query(
    `SELECT id, user_id, character_id, engine_type, export_format, manifest, expires_at
     FROM metaverse_sync_sessions
     WHERE sync_token = $1 AND expires_at > NOW()`,
    [syncToken],
  );
  if (!rows[0]) throw notFound('Sync session');
  return rows[0];
}

async function loadCharacterForExport(characterId, userId) {
  const { rows } = await query(
    `SELECT c.* FROM ai_characters c
     LEFT JOIN character_relationships r ON r.character_id = c.id AND r.user_id = $2
     WHERE c.id = $1 AND (c.is_published = TRUE OR c.creator_user_id = $2 OR r.is_following = TRUE)`,
    [characterId, userId],
  );
  return rows[0] ?? null;
}

async function loadCharacterMemories(characterId, userId) {
  try {
    const { rows } = await query(
      `SELECT id, content, importance FROM character_memories
       WHERE character_id = $1 AND user_id = $2
       ORDER BY importance DESC NULLS LAST, created_at DESC
       LIMIT 20`,
      [characterId, userId],
    );
    return rows;
  } catch {
    return [];
  }
}

function buildVrmExpressions(character) {
  const tone = character.personality?.tone ?? 'neutral';
  return {
    preset: ['neutral', 'happy', 'sad', 'angry', 'surprised', 'relaxed'],
    default: tone === 'warm' ? 'happy' : tone === 'dark' ? 'sad' : 'neutral',
  };
}
