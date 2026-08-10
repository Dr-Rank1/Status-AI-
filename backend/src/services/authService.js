import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { query } from '../config/database.js';
import { ensureEnergyState } from './energyService.js';
import { AppError } from '../utils/errors.js';
import { signHybridToken, verifyHybridToken, PQ_ENABLED } from './postQuantumAuthService.js';
import { recordUserConsent } from './aiGovernanceService.js';

const JWT_SECRET = process.env.JWT_SECRET ?? 'dev-secret-change-in-production';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN ?? '7d';

function sanitizeUser(row) {
  return {
    id: row.id,
    tenant_id: row.tenant_id,
    username: row.username,
    email: row.email,
    display_name: row.display_name,
    avatar_url: row.avatar_url,
    bio: row.bio,
    reputation: row.reputation,
    follower_count: row.follower_count,
    following_count: row.following_count,
    is_admin: row.is_admin ?? false,
    created_at: row.created_at,
  };
}

export async function hashPassword(password) {
  return bcrypt.hash(password, 10);
}

export async function comparePassword(password, hash) {
  return bcrypt.compare(password, hash);
}

export function signToken(user) {
  if (PQ_ENABLED) {
    const hybrid = signHybridToken(user);
    return hybrid.token;
  }
  return jwt.sign(
    { userId: user.id, username: user.username, tenantId: user.tenant_id },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN },
  );
}

export function signTokenWithPQ(user) {
  if (PQ_ENABLED) {
    return signHybridToken(user);
  }
  return {
    token: jwt.sign({ userId: user.id, username: user.username, tenantId: user.tenant_id }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN }),
    pqSignature: null,
    pqAlgorithm: null,
  };
}

export function verifyToken(token, pqSignature = null) {
  if (PQ_ENABLED && pqSignature) {
    return verifyHybridToken(token, pqSignature);
  }
  return jwt.verify(token, JWT_SECRET);
}

export async function registerUser({ username, email, password, displayName, tenantId }) {
  if (!username || !email || !password || !displayName || !tenantId) {
    throw new AppError('username, email, password, displayName, and tenantId are required', 400, 'VALIDATION_ERROR');
  }

  if (password.length < 8) {
    throw new AppError('Password must be at least 8 characters', 400, 'VALIDATION_ERROR');
  }

  const passwordHash = await hashPassword(password);

  try {
    const { rows } = await query(
      `INSERT INTO users (username, email, password_hash, display_name, tenant_id)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, tenant_id, username, email, display_name, avatar_url, bio, reputation,
                 follower_count, following_count, is_admin, created_at`,
      [username.toLowerCase(), email.toLowerCase(), passwordHash, displayName, tenantId]
    );

    await ensureEnergyState(rows[0].id);

    const user = sanitizeUser(rows[0]);
    const auth = signTokenWithPQ(user);

    await recordUserConsent({
      userId: user.id,
      consentType: 'ai_processing',
      granted: true,
      metadata: { source: 'registration' },
    });

    return { user, token: auth.token, pqSignature: auth.pqSignature, pqAlgorithm: auth.pqAlgorithm };
  } catch (err) {
    if (err.code === '23505') {
      throw new AppError('Username or email already exists', 409, 'CONFLICT');
    }
    throw err;
  }
}

export async function loginUser({ email, password, tenantId }) {
  if (!email || !password || !tenantId) {
    throw new AppError('email, password, and tenantId are required', 400, 'VALIDATION_ERROR');
  }

  const { rows } = await query(
    `SELECT id, tenant_id, username, email, password_hash, display_name, avatar_url, bio,
            reputation, follower_count, following_count, is_admin, created_at
     FROM users WHERE tenant_id = $1 AND (email = $2 OR username = $2)`,
    [tenantId, email.toLowerCase()]
  );

  if (rows.length === 0) {
    throw new AppError('Invalid credentials', 401, 'UNAUTHORIZED');
  }

  const userRow = rows[0];

  if (!userRow.password_hash) {
    throw new AppError('Account has no password set', 401, 'UNAUTHORIZED');
  }

  const valid = await comparePassword(password, userRow.password_hash);
  if (!valid) {
    throw new AppError('Invalid credentials', 401, 'UNAUTHORIZED');
  }

  await ensureEnergyState(userRow.id);

  const user = sanitizeUser(userRow);
  const auth = signTokenWithPQ(user);

  return { user, token: auth.token, pqSignature: auth.pqSignature, pqAlgorithm: auth.pqAlgorithm };
}

export async function getUserById(userId, tenantId = null) {
  const params = [userId];
  let sql = `SELECT id, tenant_id, username, email, display_name, avatar_url, bio, reputation,
                    follower_count, following_count, is_admin, created_at
             FROM users WHERE id = $1`;
  if (tenantId) {
    params.push(tenantId);
    sql += ` AND tenant_id = $2`;
  }

  const { rows } = await query(sql, params);

  return rows[0] ? sanitizeUser(rows[0]) : null;
}
