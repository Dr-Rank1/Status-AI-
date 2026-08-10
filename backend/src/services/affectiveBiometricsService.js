/**
 * Affective biometric context — processed HRV, facial valence, voice stress → AI tone/pacing.
 */

import { query } from '../config/database.js';
import { logger } from '../utils/logger.js';

export function buildAffectiveAiContext(metrics) {
  const hrv = metrics.hrvScore ?? 0.5;
  const facial = metrics.facialValence ?? 0;
  const stress = metrics.voiceStress ?? 0.3;

  const empathyLevel = computeEmpathyLevel({ hrv, facial, stress });
  const pacingHint = computePacingHint({ hrv, stress });
  const toneDirective = computeToneDirective({ facial, stress, empathyLevel });

  return {
    empathyLevel,
    pacingHint,
    toneDirective,
    promptBlock: [
      'AFFECTIVE CONTEXT (processed biometrics — adapt tone accordingly):',
      `- User emotional valence: ${facial >= 0 ? 'positive' : facial <= -0.3 ? 'distressed' : 'neutral'} (${facial.toFixed(2)})`,
      `- Stress level: ${stress > 0.6 ? 'elevated' : stress > 0.3 ? 'moderate' : 'calm'} (${stress.toFixed(2)})`,
      `- HRV coherence: ${hrv > 0.6 ? 'regulated' : 'variable'} (${hrv.toFixed(2)})`,
      `- Respond with empathy level ${empathyLevel.toFixed(2)}/1.0`,
      `- Pacing: ${pacingHint}`,
      toneDirective,
    ].join('\n'),
  };
}

export function computeEmpathyLevel({ hrv, facial, stress }) {
  const base = 0.5 + facial * 0.2;
  const stressBoost = stress > 0.5 ? 0.25 : 0;
  const hrvMod = hrv > 0.5 ? 0.1 : -0.05;
  return clamp(base + stressBoost + hrvMod, 0.2, 1.0);
}

export function computePacingHint({ hrv, stress }) {
  if (stress > 0.65) return 'slow, gentle, shorter sentences';
  if (hrv > 0.7 && stress < 0.3) return 'natural conversational pace';
  if (stress > 0.4) return 'measured pace with pauses';
  return 'warm and attentive';
}

export function computeToneDirective({ facial, stress, empathyLevel }) {
  if (stress > 0.7) return 'Use calming, supportive language. Avoid urgency or hype.';
  if (facial < -0.4) return 'Acknowledge difficulty subtly. Do not dismiss feelings.';
  if (empathyLevel > 0.75) return 'Match warmth — user is receptive to deeper connection.';
  return 'Stay in character with balanced emotional attunement.';
}

export async function recordAffectiveMetrics({
  userId,
  characterId = null,
  hrvScore,
  facialValence,
  voiceStress,
  metadata = {},
}) {
  const ctx = buildAffectiveAiContext({
    hrvScore,
    facialValence,
    voiceStress,
  });

  try {
    const { rows } = await query(
      `INSERT INTO affective_biometric_events (
         user_id, character_id, hrv_score, facial_valence, voice_stress,
         empathy_level, pacing_hint, processed_only, metadata
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, TRUE, $8)
       RETURNING id, created_at`,
      [
        userId,
        characterId,
        hrvScore,
        facialValence,
        voiceStress,
        ctx.empathyLevel,
        ctx.pacingHint,
        JSON.stringify(metadata),
      ],
    );

    return {
      eventId: rows[0].id,
      recordedAt: rows[0].created_at,
      ...ctx,
    };
  } catch (err) {
    logger.warn('[Affective] Persist failed:', err.message);
    return ctx;
  }
}

export async function getLatestAffectiveContext(userId, characterId = null) {
  const params = [userId];
  let sql = `SELECT hrv_score, facial_valence, voice_stress, empathy_level, pacing_hint, created_at
             FROM affective_biometric_events WHERE user_id = $1`;
  if (characterId) {
    params.push(characterId);
    sql += ` AND (character_id = $2 OR character_id IS NULL)`;
  }
  sql += ` ORDER BY created_at DESC LIMIT 1`;

  const { rows } = await query(sql, params);
  if (!rows[0]) return null;

  return buildAffectiveAiContext({
    hrvScore: parseFloat(rows[0].hrv_score),
    facialValence: parseFloat(rows[0].facial_valence),
    voiceStress: parseFloat(rows[0].voice_stress),
  });
}

function clamp(n, min, max) {
  return Math.min(max, Math.max(min, Number(n)));
}
