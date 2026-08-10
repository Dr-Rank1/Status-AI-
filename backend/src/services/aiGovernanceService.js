/**
 * AI Governance logging — EU AI Act / GDPR audit trail for model decisions.
 */

import crypto from 'crypto';
import { query } from '../config/database.js';
import { logger } from '../utils/logger.js';

const DEFAULT_TAGS = ['EU_AI_ACT', 'GDPR'];

export async function logAiGovernanceEvent({
  eventType,
  userId = null,
  characterId = null,
  modelProvider = null,
  modelName = null,
  decision = {},
  dataProvenance = {},
  humanOversight = false,
  regulatoryTags = DEFAULT_TAGS,
}) {
  try {
    const { rows } = await query(
      `INSERT INTO ai_governance_logs (
         event_type, user_id, character_id, model_provider, model_name,
         decision, data_provenance, human_oversight, regulatory_tags
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING id, created_at`,
      [
        eventType,
        userId,
        characterId,
        modelProvider,
        modelName,
        JSON.stringify(decision),
        JSON.stringify(dataProvenance),
        humanOversight,
        regulatoryTags,
      ],
    );
    return rows[0];
  } catch (err) {
    logger.warn('[AI Governance] Log failed:', err.message);
    return null;
  }
}

export async function recordUserConsent({
  userId,
  consentType,
  granted,
  policyVersion = process.env.CONSENT_POLICY_VERSION ?? '2026-01',
  ipHash = null,
  metadata = {},
}) {
  const { rows } = await query(
    `INSERT INTO user_consent_records (user_id, consent_type, granted, policy_version, ip_hash, metadata)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, consent_type, granted, policy_version, recorded_at`,
    [userId, consentType, granted, policyVersion, ipHash, JSON.stringify(metadata)],
  );
  return rows[0];
}

export async function logModelDecision({
  userId,
  characterId,
  provider,
  model,
  mode,
  routeReason,
  inputSummary,
  outputSummary,
  toolResults = [],
  multiAgent = null,
  latencyMs,
  humanOversight = false,
}) {
  return logAiGovernanceEvent({
    eventType: 'model_decision',
    userId,
    characterId,
    modelProvider: provider,
    modelName: model,
    humanOversight,
    decision: {
      mode,
      routeReason,
      outputSummary: (outputSummary ?? '').slice(0, 500),
      toolCount: toolResults?.length ?? 0,
      multiAgentPlan: multiAgent?.plan ?? null,
      latencyMs,
      explainability: 'Automated routing with optional multi-agent subagent decomposition',
    },
    dataProvenance: {
      inputClass: 'user_message',
      inputLength: inputSummary?.length ?? 0,
      inputHash: hashPreview(inputSummary),
      sources: ['dm_messages', 'character_memories', 'posts'].filter(Boolean),
      retentionPolicy: 'GDPR lawful basis — user interaction',
    },
  });
}

function hashPreview(text) {
  if (!text) return null;
  return crypto.createHash('sha256').update(text).digest('hex').slice(0, 16);
}

export async function exportAuditTrail({ since, until, limit = 500, eventType = null }) {
  const params = [];
  let sql = `SELECT id, event_type, user_id, character_id, model_provider, model_name,
                    decision, data_provenance, human_oversight, regulatory_tags, created_at
             FROM ai_governance_logs WHERE 1=1`;

  if (since) {
    params.push(since);
    sql += ` AND created_at >= $${params.length}`;
  }
  if (until) {
    params.push(until);
    sql += ` AND created_at <= $${params.length}`;
  }
  if (eventType) {
    params.push(eventType);
    sql += ` AND event_type = $${params.length}`;
  }

  params.push(Math.min(limit, 2000));
  sql += ` ORDER BY created_at DESC LIMIT $${params.length}`;

  const { rows: governance } = await query(sql, params);

  const consentParams = since ? [since] : [];
  const consentSql = since
    ? `SELECT id, user_id, consent_type, granted, policy_version, recorded_at
       FROM user_consent_records WHERE recorded_at >= $1 ORDER BY recorded_at DESC LIMIT 200`
    : `SELECT id, user_id, consent_type, granted, policy_version, recorded_at
       FROM user_consent_records ORDER BY recorded_at DESC LIMIT 200`;

  const { rows: consents } = await query(consentSql, consentParams);

  return {
    exportedAt: new Date().toISOString(),
    regulatoryFramework: ['EU AI Act (high-risk AI logging)', 'GDPR (consent & provenance)'],
    governanceLogs: governance,
    consentHistory: consents,
    humanOversightStatement:
      'Administrators may review flagged decisions. Multi-agent workflows decompose research and dialogue for explainability.',
  };
}
