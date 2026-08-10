/**
 * Post-quantum hybrid authentication — ML-DSA detached signatures over JWT payloads.
 *
 * Production: swap HMAC stand-in for @noble/post-quantum ml_dsa65 when fully deployed.
 */

import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { logger } from '../utils/logger.js';

const JWT_SECRET = process.env.JWT_SECRET ?? 'dev-secret-change-in-production';
const PQ_PEPPER = process.env.PQ_AUTH_PEPPER ?? 'status-pq-auth-pepper';
const PQ_ENABLED = process.env.PQ_AUTH_ENABLED !== 'false';
const PQ_ALGORITHM = process.env.PQ_AUTH_ALGORITHM ?? 'ml-dsa-65-hybrid-v1';

export { PQ_ENABLED, PQ_ALGORITHM };

export function signHybridToken(user) {
  const payload = { userId: user.id, username: user.username, tenantId: user.tenant_id, pq: true };
  const token = jwt.sign(payload, JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN ?? '7d',
    algorithm: 'HS256',
  });

  const pqSignature = signPayloadPQ(token);
  return { token, pqSignature, pqAlgorithm: PQ_ALGORITHM };
}

export function signPayloadPQ(message) {
  const key = crypto.createHash('sha512').update(`${PQ_PEPPER}:pq-sign`).digest();
  return crypto.createHmac('sha512', key).update(message).digest('base64url');
}

export function verifyPayloadPQ(message, signature) {
  if (!signature) return false;
  const expected = signPayloadPQ(message);
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
  } catch {
    return expected === signature;
  }
}

export function verifyHybridToken(token, pqSignature) {
  const payload = jwt.verify(token, JWT_SECRET);

  if (PQ_ENABLED) {
    const valid = verifyPayloadPQ(token, pqSignature);
    if (!valid) {
      const err = new Error('Post-quantum signature verification failed');
      err.code = 'PQ_AUTH_FAILED';
      throw err;
    }
  }

  return payload;
}

export function extractPQCredentials(req) {
  return {
    token: req.headers.authorization?.startsWith('Bearer ')
      ? req.headers.authorization.slice(7)
      : null,
    pqSignature: req.headers['x-status-pq-signature'] ?? req.headers['x-status-pq-signature'.toLowerCase()],
  };
}

export async function registerPQDeviceKey({ userId, deviceId, kyberPublicKey, algorithm = 'kyber768' }) {
  const { query } = await import('../config/database.js');
  const { rows } = await query(
    `INSERT INTO pq_device_keys (user_id, device_id, kyber_public_key, algorithm)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (user_id, device_id)
     DO UPDATE SET kyber_public_key = EXCLUDED.kyber_public_key, algorithm = EXCLUDED.algorithm
     RETURNING id, device_id, algorithm, created_at`,
    [userId, deviceId, kyberPublicKey, algorithm],
  );
  return rows[0];
}

export function logPQHandshakeFailure(reason, metadata = {}) {
  logger.error(`[PQ Auth] Handshake failed: ${reason}`, metadata);
}
