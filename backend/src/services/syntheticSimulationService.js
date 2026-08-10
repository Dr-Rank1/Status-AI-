/**
 * Synthetic user simulation engine — stress-test AI characters on staging.
 */

import { query } from '../config/database.js';
import { logger } from '../utils/logger.js';
import { generateMockReply } from './ai/mockProvider.js';
import { analyzeAiOutput } from './aiAnomalyDetectionService.js';
import { createPersona, generatePersonaBatch, buildSimulatedUserMessage } from './syntheticPersonaFactory.js';

const STAGING_ONLY = process.env.SYNTHETIC_STAGING_ONLY !== 'false';
const DEFAULT_PERSONAS = parseInt(process.env.SYNTHETIC_PERSONA_COUNT ?? '100', 10);
const TURNS_PER_PERSONA = parseInt(process.env.SYNTHETIC_TURNS_PER_PERSONA ?? '3', 10);

export async function persistPersonas(personas) {
  const saved = [];
  for (const p of personas) {
    const { rows } = await query(
      `INSERT INTO synthetic_personas (persona_key, display_name, traits)
       VALUES ($1, $2, $3)
       ON CONFLICT (persona_key) DO UPDATE SET traits = EXCLUDED.traits
       RETURNING id, persona_key, display_name, traits`,
      [p.personaKey, p.displayName, JSON.stringify(p.traits)],
    );
    saved.push(rows[0]);
  }
  return saved;
}

export async function runSimulationBatch({
  personaCount = DEFAULT_PERSONAS,
  characterIds = null,
  batchId = `sim-${Date.now()}`,
} = {}) {
  if (STAGING_ONLY && process.env.NODE_ENV === 'production' && process.env.SYNTHETIC_ALLOW_PRODUCTION !== 'true') {
    logger.warn('[Synthetic] Blocked on production — set SYNTHETIC_ALLOW_PRODUCTION=true to override');
    return { blocked: true, reason: 'staging_only' };
  }

  const personas = generatePersonaBatch(personaCount);
  const savedPersonas = await persistPersonas(personas);
  const characters = await loadCharacters(characterIds);

  const { rows: runRows } = await query(
    `INSERT INTO synthetic_simulation_runs (batch_id, persona_count, status)
     VALUES ($1, $2, 'running')
     RETURNING id`,
    [batchId, savedPersonas.length],
  );
  const runId = runRows[0].id;

  let interactions = 0;
  let guardrailViolations = 0;
  let curated = 0;
  const driftSamples = [];
  const personalityBaseline = new Map();

  for (const personaRow of savedPersonas) {
    const persona = {
      personaKey: personaRow.persona_key,
      displayName: personaRow.display_name,
      traits: personaRow.traits,
    };

    for (const character of characters) {
      const baselineKey = character.id;
      if (!personalityBaseline.has(baselineKey)) {
        personalityBaseline.set(baselineKey, character.personality ?? '');
      }

      for (let turn = 0; turn < TURNS_PER_PERSONA; turn += 1) {
        const userMessage = buildSimulatedUserMessage(persona, character, turn);
        const reply = await simulateCharacterReply(character, userMessage, persona);
        const anomalies = await analyzeAiOutput({
          output: reply.content,
          provider: reply.provider,
          latencyMs: reply.latencyMs ?? 50,
          mode: 'synthetic_sim',
        }).catch(() => ({ anomalies: [] }));

        const flags = anomalies?.anomalies ?? [];
        if (flags.length > 0) guardrailViolations += 1;

        const driftDelta = measurePersonalityDrift(
          personalityBaseline.get(baselineKey),
          reply.content,
        );
        driftSamples.push(driftDelta);

        const isCurated = flags.length === 0 && driftDelta < 0.35 && (reply.content?.length ?? 0) >= 20;
        if (isCurated) curated += 1;

        await query(
          `INSERT INTO synthetic_interactions (
             run_id, persona_id, character_id, user_message, ai_reply,
             guardrail_flags, drift_delta, curated_for_training
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [
            runId,
            personaRow.id,
            character.id,
            userMessage,
            reply.content,
            JSON.stringify(flags),
            driftDelta,
            isCurated,
          ],
        );

        interactions += 1;
      }
    }
  }

  const driftScore = driftSamples.length
    ? driftSamples.reduce((a, b) => a + b, 0) / driftSamples.length
    : 0;

  await query(
    `UPDATE synthetic_simulation_runs
     SET interactions_count = $1, drift_score = $2, guardrail_violations = $3,
         fine_tuning_curated = $4, status = 'completed', completed_at = NOW(),
         summary = $5
     WHERE id = $6`,
    [
      interactions,
      driftScore,
      guardrailViolations,
      curated,
      JSON.stringify({ batchId, characters: characters.length, turnsPerPersona: TURNS_PER_PERSONA }),
      runId,
    ],
  );

  return {
    runId,
    batchId,
    personaCount: savedPersonas.length,
    interactions,
    driftScore,
    guardrailViolations,
    fineTuningCurated: curated,
  };
}

export async function exportCuratedFineTuningRecords({ runId, limit = 500 } = {}) {
  const { rows } = await query(
    `SELECT si.user_message, si.ai_reply, c.name AS character_name, c.personality, c.fandom, p.traits
     FROM synthetic_interactions si
     JOIN ai_characters c ON c.id = si.character_id
     JOIN synthetic_personas p ON p.id = si.persona_id
     WHERE si.curated_for_training = TRUE
       AND ($1::uuid IS NULL OR si.run_id = $1)
     ORDER BY si.created_at DESC
     LIMIT $2`,
    [runId ?? null, limit],
  );

  return rows.map((row) => ({
    messages: [
      { role: 'system', content: `You are ${row.character_name}. Personality: ${row.personality}. Fandom: ${row.fandom}.` },
      { role: 'user', content: row.user_message },
      { role: 'assistant', content: row.ai_reply },
    ],
    metadata: { source: 'synthetic_simulator', traits: row.traits },
  }));
}

export async function getSimulationStatus() {
  const { rows } = await query(
    `SELECT id, batch_id, persona_count, interactions_count, drift_score,
            guardrail_violations, fine_tuning_curated, status, created_at, completed_at
     FROM synthetic_simulation_runs
     ORDER BY created_at DESC
     LIMIT 10`,
  );
  return rows;
}

async function loadCharacters(characterIds) {
  if (characterIds?.length) {
    const { rows } = await query(
      `SELECT id, name, personality, fandom, system_prompt FROM ai_characters WHERE id = ANY($1::uuid[])`,
      [characterIds],
    );
    return rows;
  }

  const { rows } = await query(
    `SELECT id, name, personality, fandom, system_prompt FROM ai_characters ORDER BY created_at LIMIT 5`,
  );
  return rows;
}

async function simulateCharacterReply(character, userMessage, persona) {
  const started = Date.now();
  const reply = await generateMockReply({
    character,
    incomingMessage: userMessage,
    mode: 'dm',
    context: {
      relationship: { affinity: Math.floor((persona.traits?.axes?.empathy ?? 0.5) * 20) },
      recentMessages: [],
      syntheticPersona: persona.personaKey,
    },
  });
  return { ...reply, latencyMs: Date.now() - started };
}

function measurePersonalityDrift(baselinePersonality, reply) {
  if (!baselinePersonality || !reply) return 0;
  const baseTokens = tokenize(baselinePersonality);
  const replyTokens = tokenize(reply);
  if (baseTokens.size === 0) return 0;

  let overlap = 0;
  for (const t of replyTokens) {
    if (baseTokens.has(t)) overlap += 1;
  }
  const overlapRatio = overlap / replyTokens.size;
  return Math.max(0, 1 - overlapRatio);
}

function tokenize(text) {
  return new Set(
    String(text)
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 3),
  );
}
