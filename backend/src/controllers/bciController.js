import { recordBciIntent, getRecentBciEvents } from '../services/bciIntentService.js';

export async function submitIntent(req, res) {
  const {
    valence,
    arousal,
    focusLevel,
    focus_level: focusLevelSnake,
    intentType,
    intent_type: intentTypeSnake,
    characterId,
    character_id: characterIdSnake,
  } = req.body;

  const result = await recordBciIntent({
    userId: req.user.id,
    characterId: characterId ?? characterIdSnake ?? null,
    valence: Number(valence),
    arousal: Number(arousal),
    focusLevel: focusLevel ?? focusLevelSnake ?? null,
    intentType: intentType ?? intentTypeSnake ?? 'ambient',
  });

  res.json({ data: result });
}

export async function recentEvents(req, res) {
  const limit = Math.min(parseInt(req.query.limit ?? '20', 10), 50);
  const events = await getRecentBciEvents(req.user.id, limit);
  res.json({ data: events });
}
