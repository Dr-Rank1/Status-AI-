/**
 * BCI intent processing — maps valence/arousal to affinity and UI theme hints.
 */

import { query } from '../config/database.js';
import { logger } from '../utils/logger.js';
import { applyInteraction } from './relationshipService.js';

export function mapBciToTheme({ valence, arousal }) {
  const v = clamp(valence, -1, 1);
  const a = clamp(arousal, 0, 1);

  const hue = lerp(220, 320, (v + 1) / 2);
  const saturation = lerp(0.35, 0.85, a);
  const lightness = lerp(0.12, 0.22, (v + 1) / 2);

  return {
    backgroundColor: hslToHex(hue, saturation * 0.4, lightness),
    accentColor: hslToHex(hue, saturation, lerp(0.45, 0.65, a)),
    moodLabel: v > 0.3 ? 'positive' : v < -0.3 ? 'negative' : 'neutral',
    energyLevel: a > 0.6 ? 'high' : a > 0.3 ? 'medium' : 'low',
  };
}

export function computeAffinityDelta({ valence, arousal, intentType }) {
  let delta = Math.round(valence * 5);
  if (intentType === 'focus_character') delta += 2;
  if (intentType === 'disengage') delta -= 3;
  if (arousal > 0.7 && valence > 0) delta += 1;
  return clamp(delta, -10, 10);
}

export async function recordBciIntent({
  userId,
  characterId = null,
  valence,
  arousal,
  focusLevel = null,
  intentType,
}) {
  const themeHint = mapBciToTheme({ valence, arousal });
  let affinityDelta = 0;
  let affinity = null;

  if (characterId) {
    affinityDelta = computeAffinityDelta({ valence, arousal, intentType });
    const interaction = await applyInteraction({
      userId,
      characterId,
      userMessage: `[bci:${intentType}:v${valence.toFixed(2)}]`,
      interactionType: 'bci',
    });
    affinity = interaction.affinity;
  }

  try {
    const { rows } = await query(
      `INSERT INTO bci_intent_events (
         user_id, character_id, valence, arousal, focus_level,
         intent_type, affinity_delta, ui_theme_hint, processed_only
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, TRUE)
       RETURNING id, created_at`,
      [
        userId,
        characterId,
        valence,
        arousal,
        focusLevel,
        intentType,
        affinityDelta,
        JSON.stringify(themeHint),
      ],
    );

    return {
      eventId: rows[0].id,
      recordedAt: rows[0].created_at,
      affinity,
      affinityDelta,
      themeHint,
    };
  } catch (err) {
    logger.warn('[BCI] Intent persist failed:', err.message);
    return { affinity, affinityDelta, themeHint, persisted: false };
  }
}

export async function getRecentBciEvents(userId, limit = 20) {
  const { rows } = await query(
    `SELECT id, character_id, valence, arousal, focus_level, intent_type,
            affinity_delta, ui_theme_hint, created_at
     FROM bci_intent_events
     WHERE user_id = $1
     ORDER BY created_at DESC
     LIMIT $2`,
    [userId, limit],
  );
  return rows;
}

function clamp(n, min, max) {
  return Math.min(max, Math.max(min, Number(n)));
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function hslToHex(h, s, l) {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r = 0; let g = 0; let b = 0;
  if (h < 60) { r = c; g = x; }
  else if (h < 120) { r = x; g = c; }
  else if (h < 180) { g = c; b = x; }
  else if (h < 240) { g = x; b = c; }
  else if (h < 300) { r = x; b = c; }
  else { r = c; b = x; }
  const toHex = (v) => Math.round((v + m) * 255).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}
