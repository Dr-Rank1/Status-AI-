import { recordAffectiveMetrics, getLatestAffectiveContext } from '../services/affectiveBiometricsService.js';

export async function submitAffectiveMetrics(req, res) {
  const {
    hrvScore,
    hrv_score: hrvSnake,
    facialValence,
    facial_valence: facialSnake,
    voiceStress,
    voice_stress: voiceSnake,
    characterId,
    character_id: charSnake,
  } = req.body;

  const result = await recordAffectiveMetrics({
    userId: req.user.id,
    characterId: characterId ?? charSnake ?? null,
    hrvScore: Number(hrvScore ?? hrvSnake ?? 0.5),
    facialValence: Number(facialValence ?? facialSnake ?? 0),
    voiceStress: Number(voiceStress ?? voiceSnake ?? 0.3),
    metadata: { source: 'mobile_processed' },
  });

  res.json({ data: result });
}

export async function getAffectiveContext(req, res) {
  const characterId = req.query.characterId ?? null;
  const ctx = await getLatestAffectiveContext(req.user.id, characterId);
  res.json({ data: ctx ?? { promptBlock: null } });
}
