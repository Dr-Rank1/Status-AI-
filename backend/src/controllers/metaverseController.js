import {
  createMetaverseSyncSession,
  getMetaverseSyncByToken,
  buildCharacterVrmManifest,
  buildOpenXrManifest,
} from '../services/metaverseExportService.js';

export async function createSync(req, res) {
  const { characterId, engineType, exportFormat } = req.body;
  const session = await createMetaverseSyncSession({
    userId: req.user.id,
    characterId,
    engineType: engineType ?? 'generic',
    exportFormat: exportFormat ?? 'vrm',
  });
  res.status(201).json({ data: session });
}

export async function getSync(req, res) {
  const session = await getMetaverseSyncByToken(req.params.token);
  res.json({
    data: {
      characterId: session.character_id,
      engineType: session.engine_type,
      exportFormat: session.export_format,
      manifest: session.manifest,
      expiresAt: session.expires_at,
    },
  });
}

export async function exportCharacter(req, res) {
  const { characterId } = req.params;
  const format = req.query.format ?? 'vrm';

  const manifest = format === 'openxr'
    ? await buildOpenXrManifest(characterId, req.user.id)
    : await buildCharacterVrmManifest(characterId, req.user.id);

  res.json({ data: manifest, meta: { format, specVersion: '1.0' } });
}
