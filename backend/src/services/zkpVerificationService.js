/**
 * Zero-knowledge proof verification — prove account attributes without revealing PII.
 *
 * Uses HMAC commitment + signed attestations (upgrade path to full zk-SNARKs).
 */

import crypto from 'crypto';
import { query } from '../config/database.js';

const PROOF_TTL_MS = parseInt(process.env.ZKP_PROOF_TTL_MS ?? '3600000', 10);
const VIP_REPUTATION = parseInt(process.env.ZKP_VIP_REPUTATION ?? '500', 10);
const VIP_ACCOUNT_DAYS = parseInt(process.env.ZKP_VIP_ACCOUNT_DAYS ?? '30', 10);

function pepper() {
  return process.env.ZKP_PEPPER ?? 'status-zkp-dev-pepper';
}

export function deriveCommitment(userId) {
  return crypto.createHmac('sha256', pepper()).update(String(userId)).digest('hex');
}

function signPayload(payload) {
  const body = JSON.stringify(payload);
  return crypto.createHmac('sha256', `${pepper()}:sign`).update(body).digest('hex');
}

function daysSince(date) {
  const ms = Date.now() - new Date(date).getTime();
  return Math.floor(ms / (24 * 60 * 60 * 1000));
}

export function buildClaims(user) {
  const accountAgeDays = daysSince(user.created_at);
  return {
    accountAgeDays,
    reputation: user.reputation ?? 0,
    vip: (user.reputation ?? 0) >= VIP_REPUTATION || accountAgeDays >= VIP_ACCOUNT_DAYS,
    isAdmin: Boolean(user.is_admin),
  };
}

export async function generateProofBundle(userId) {
  const { rows } = await query(
    `SELECT id, reputation, is_admin, created_at FROM users WHERE id = $1`,
    [userId],
  );

  if (rows.length === 0) {
    throw new Error('User not found');
  }

  const user = rows[0];
  const commitment = deriveCommitment(userId);
  const claims = buildClaims(user);
  const issuedAt = Date.now();
  const expiresAt = issuedAt + PROOF_TTL_MS;
  const nullifier = crypto
    .createHash('sha256')
    .update(`${commitment}:${issuedAt}:${claims.reputation}`)
    .digest('hex');

  const payload = {
    v: 1,
    commitment,
    claims,
    issuedAt,
    expiresAt,
    nullifier,
  };
  payload.sig = signPayload(payload);

  await query(
    `INSERT INTO zkp_proof_nullifiers (nullifier, commitment, claim_type, expires_at)
     VALUES ($1, $2, 'full_bundle', to_timestamp($3 / 1000.0))
     ON CONFLICT (nullifier) DO NOTHING`,
    [nullifier, commitment, expiresAt],
  );

  const proof = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return { proof, commitment, claims, expiresAt };
}

export function verifyClaim(proofBase64, requiredClaim) {
  let payload;
  try {
    payload = JSON.parse(Buffer.from(proofBase64, 'base64url').toString('utf8'));
  } catch {
    return { valid: false, reason: 'invalid_proof_encoding' };
  }

  if (payload.v !== 1) {
    return { valid: false, reason: 'unsupported_version' };
  }

  const { sig, ...unsigned } = payload;
  const expected = signPayload(unsigned);
  if (sig !== expected) {
    return { valid: false, reason: 'invalid_signature' };
  }

  if (Date.now() > payload.expiresAt) {
    return { valid: false, reason: 'expired' };
  }

  const { claims } = payload;

  switch (requiredClaim.type) {
    case 'reputation_min':
      if ((claims.reputation ?? 0) < requiredClaim.threshold) {
        return { valid: false, reason: 'reputation_below_threshold', commitment: payload.commitment };
      }
      break;
    case 'account_age_days':
      if ((claims.accountAgeDays ?? 0) < requiredClaim.threshold) {
        return { valid: false, reason: 'account_too_new', commitment: payload.commitment };
      }
      break;
    case 'vip':
      if (!claims.vip) {
        return { valid: false, reason: 'not_vip', commitment: payload.commitment };
      }
      break;
    default:
      return { valid: false, reason: 'unknown_claim_type' };
  }

  return {
    valid: true,
    commitment: payload.commitment,
    claimVerified: requiredClaim.type,
    nullifier: payload.nullifier,
  };
}

export async function verifyProofWithNullifierCheck(proofBase64, requiredClaim) {
  const result = verifyClaim(proofBase64, requiredClaim);
  if (!result.valid) return result;

  const { rows } = await query(
    `SELECT id FROM zkp_proof_nullifiers WHERE nullifier = $1 AND expires_at > NOW()`,
    [result.nullifier],
  );

  if (rows.length === 0) {
    return { valid: false, reason: 'nullifier_unknown_or_expired' };
  }

  return {
    valid: true,
    commitment: result.commitment,
    claimVerified: result.claimVerified,
    revealed: {
      // Only pseudonymous commitment — no user id, email, or chat history
      pseudonym: result.commitment.slice(0, 16),
    },
  };
}

export async function consumeNullifier(nullifier) {
  await query(`DELETE FROM zkp_proof_nullifiers WHERE nullifier = $1`, [nullifier]);
}
