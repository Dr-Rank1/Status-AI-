/**
 * OAuth2 client-credentials for public developer API.
 */

import crypto from 'crypto';
import bcrypt from 'bcrypt';
import { query } from '../config/database.js';
import { AppError } from '../utils/errors.js';

const TOKEN_TTL_SEC = parseInt(process.env.OAUTH_TOKEN_TTL_SEC ?? '3600', 10);

export function generateClientCredentials() {
  const clientId = `status_${crypto.randomBytes(12).toString('hex')}`;
  const clientSecret = crypto.randomBytes(32).toString('base64url');
  return { clientId, clientSecret };
}

export async function registerClient({ name, ownerUserId, scopes = ['feed:read', 'characters:read'] }) {
  const { clientId, clientSecret } = generateClientCredentials();
  const hash = await bcrypt.hash(clientSecret, 10);

  await query(
    `INSERT INTO api_oauth_clients (client_id, client_secret_hash, name, owner_user_id, scopes)
     VALUES ($1, $2, $3, $4, $5)`,
    [clientId, hash, name, ownerUserId ?? null, scopes],
  );

  return { clientId, clientSecret, name, scopes };
}

export async function issueToken({ clientId, clientSecret }) {
  const { rows } = await query(
    `SELECT * FROM api_oauth_clients WHERE client_id = $1 AND is_active = TRUE`,
    [clientId],
  );

  if (rows.length === 0) {
    throw new AppError('Invalid client credentials', 401, 'INVALID_CLIENT');
  }

  const client = rows[0];
  const valid = await bcrypt.compare(clientSecret, client.client_secret_hash);
  if (!valid) {
    throw new AppError('Invalid client credentials', 401, 'INVALID_CLIENT');
  }

  const rawToken = crypto.randomBytes(48).toString('base64url');
  const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
  const expiresAt = new Date(Date.now() + TOKEN_TTL_SEC * 1000);

  await query(
    `INSERT INTO api_oauth_tokens (client_id, token_hash, scopes, expires_at)
     VALUES ($1, $2, $3, $4)`,
    [clientId, tokenHash, client.scopes, expiresAt.toISOString()],
  );

  return {
    access_token: rawToken,
    token_type: 'Bearer',
    expires_in: TOKEN_TTL_SEC,
    scope: client.scopes.join(' '),
  };
}

export async function validateAccessToken(token) {
  if (!token?.trim()) return null;

  const tokenHash = crypto.createHash('sha256').update(token.trim()).digest('hex');
  const { rows } = await query(
    `SELECT t.client_id, t.scopes, c.name, c.rate_limit_max
     FROM api_oauth_tokens t
     JOIN api_oauth_clients c ON c.client_id = t.client_id
     WHERE t.token_hash = $1
       AND t.expires_at > NOW()
       AND c.is_active = TRUE`,
    [tokenHash],
  );

  return rows[0] ?? null;
}

export function tokenHasScope(client, scope) {
  return (client?.scopes ?? []).includes(scope);
}
