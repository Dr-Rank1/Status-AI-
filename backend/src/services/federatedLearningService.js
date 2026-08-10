/**
 * Federated learning — aggregate encrypted on-device weight deltas.
 */

import crypto from 'crypto';
import { query } from '../config/database.js';
import { logger } from '../utils/logger.js';

const AGGREGATION_KEY = process.env.FEDERATED_AGGREGATION_KEY ?? 'status-fed-dev-key';
const WEIGHT_DIM = parseInt(process.env.FEDERATED_WEIGHT_DIM ?? '32', 10);

function decryptPayload(encryptedPayload) {
  try {
    const raw = Buffer.from(encryptedPayload, 'base64');
    const iv = raw.subarray(0, 12);
    const tag = raw.subarray(12, 28);
    const data = raw.subarray(28);
    const key = crypto.createHash('sha256').update(AGGREGATION_KEY).digest();
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    const clear = Buffer.concat([decipher.update(data), decipher.final()]);
    return JSON.parse(clear.toString('utf8'));
  } catch (err) {
    throw new Error(`Failed to decrypt contribution: ${err.message}`);
  }
}

export function encryptPayload(payload) {
  const key = crypto.createHash('sha256').update(AGGREGATION_KEY).digest();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const data = Buffer.concat([cipher.update(JSON.stringify(payload), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, data]).toString('base64');
}

export async function getOrCreateOpenRound() {
  const { rows: open } = await query(
    `SELECT * FROM federated_rounds WHERE status = 'open' ORDER BY round_number DESC LIMIT 1`,
  );

  if (open.length > 0) return open[0];

  const { rows: latest } = await query(
    `SELECT COALESCE(MAX(round_number), 0) + 1 AS next FROM federated_rounds`,
  );
  const roundNumber = latest[0]?.next ?? 1;

  const { rows } = await query(
    `INSERT INTO federated_rounds (round_number, status, baseline_version)
     VALUES ($1, 'open', (SELECT COALESCE(MAX(version), 1) FROM federated_global_weights))
     RETURNING *`,
    [roundNumber],
  );

  return rows[0];
}

export async function submitContribution({ userCommitment, encryptedPayload, sampleCount }) {
  if (!userCommitment?.trim() || !encryptedPayload?.trim()) {
    throw new Error('userCommitment and encryptedPayload are required');
  }

  const round = await getOrCreateOpenRound();
  const decoded = decryptPayload(encryptedPayload);

  if (!Array.isArray(decoded.weights) || decoded.weights.length !== WEIGHT_DIM) {
    throw new Error(`Invalid weight vector — expected ${WEIGHT_DIM} dimensions`);
  }

  await query(
    `INSERT INTO federated_contributions (round_id, user_commitment, encrypted_payload, sample_count)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (round_id, user_commitment)
     DO UPDATE SET encrypted_payload = EXCLUDED.encrypted_payload,
                   sample_count = EXCLUDED.sample_count,
                   created_at = NOW()`,
    [round.id, userCommitment.trim(), encryptedPayload.trim(), Math.max(1, sampleCount ?? 1)],
  );

  await query(
    `UPDATE federated_rounds
     SET contributor_count = (
       SELECT COUNT(*) FROM federated_contributions WHERE round_id = $1
     )
     WHERE id = $1`,
    [round.id],
  );

  logger.info(`[Federated] contribution round=${round.round_number} commitment=${userCommitment.slice(0, 8)}…`);

  return { roundId: round.id, roundNumber: round.round_number, accepted: true };
}

export async function aggregateRound(roundId) {
  const { rows: contributions } = await query(
    `SELECT encrypted_payload, sample_count FROM federated_contributions WHERE round_id = $1`,
    [roundId],
  );

  if (contributions.length === 0) {
    throw new Error('No contributions to aggregate');
  }

  const vectors = contributions.map((c) => {
    const decoded = decryptPayload(c.encrypted_payload);
    return { weights: decoded.weights, samples: c.sample_count };
  });

  const totalSamples = vectors.reduce((sum, v) => sum + v.samples, 0);
  const aggregated = new Array(WEIGHT_DIM).fill(0);

  for (const v of vectors) {
    const weight = v.samples / totalSamples;
    for (let i = 0; i < WEIGHT_DIM; i += 1) {
      aggregated[i] += v.weights[i] * weight;
    }
  }

  const { rows: versionRow } = await query(
    `SELECT COALESCE(MAX(version), 0) + 1 AS next FROM federated_global_weights`,
  );
  const version = versionRow[0]?.next ?? 1;

  await query(
    `INSERT INTO federated_global_weights (version, weights, contributor_count)
     VALUES ($1, $2, $3)`,
    [version, JSON.stringify(aggregated), contributions.length],
  );

  await query(
    `UPDATE federated_rounds SET status = 'closed', closed_at = NOW() WHERE id = $1`,
    [roundId],
  );

  logger.info(`[Federated] aggregated round=${roundId} version=${version} contributors=${contributions.length}`);

  return { version, weights: aggregated, contributorCount: contributions.length };
}

export async function getLatestGlobalWeights() {
  const { rows } = await query(
    `SELECT version, weights, contributor_count, created_at
     FROM federated_global_weights
     ORDER BY version DESC
     LIMIT 1`,
  );

  if (rows.length === 0) {
    return {
      version: 0,
      weights: new Array(WEIGHT_DIM).fill(0),
      contributorCount: 0,
    };
  }

  return {
    version: rows[0].version,
    weights: rows[0].weights,
    contributorCount: rows[0].contributor_count,
    createdAt: rows[0].created_at,
  };
}

export async function getFederatedStatus() {
  const round = await getOrCreateOpenRound();
  const global = await getLatestGlobalWeights();
  return {
    openRound: {
      id: round.id,
      roundNumber: round.round_number,
      contributorCount: round.contributor_count,
    },
    globalModel: global,
    weightDim: WEIGHT_DIM,
  };
}
