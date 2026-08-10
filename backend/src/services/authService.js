import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { query } from '../config/database.js';
import { ensureEnergyState } from './energyService.js';
import { AppError } from '../utils/errors.js';

const JWT_SECRET = process.env.JWT_SECRET ?? 'dev-secret-change-in-production';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN ?? '7d';

function sanitizeUser(row) {
  return {
    id: row.id,
    username: row.username,
    email: row.email,
    display_name: row.display_name,
    avatar_url: row.avatar_url,
    bio: row.bio,
    reputation: row.reputation,
    follower_count: row.follower_count,
    following_count: row.following_count,
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
  return jwt.sign(
    { userId: user.id, username: user.username },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
}

export function verifyToken(token) {
  return jwt.verify(token, JWT_SECRET);
}

export async function registerUser({ username, email, password, displayName }) {
  if (!username || !email || !password || !displayName) {
    throw new AppError('username, email, password, and displayName are required', 400, 'VALIDATION_ERROR');
  }

  if (password.length < 8) {
    throw new AppError('Password must be at least 8 characters', 400, 'VALIDATION_ERROR');
  }

  const passwordHash = await hashPassword(password);

  try {
    const { rows } = await query(
      `INSERT INTO users (username, email, password_hash, display_name)
       VALUES ($1, $2, $3, $4)
       RETURNING id, username, email, display_name, avatar_url, bio, reputation,
                 follower_count, following_count, created_at`,
      [username.toLowerCase(), email.toLowerCase(), passwordHash, displayName]
    );

    await ensureEnergyState(rows[0].id);

    const user = sanitizeUser(rows[0]);
    const token = signToken(user);

    return { user, token };
  } catch (err) {
    if (err.code === '23505') {
      throw new AppError('Username or email already exists', 409, 'CONFLICT');
    }
    throw err;
  }
}

export async function loginUser({ email, password }) {
  if (!email || !password) {
    throw new AppError('email and password are required', 400, 'VALIDATION_ERROR');
  }

  const { rows } = await query(
    `SELECT id, username, email, password_hash, display_name, avatar_url, bio,
            reputation, follower_count, following_count, created_at
     FROM users WHERE email = $1 OR username = $1`,
    [email.toLowerCase()]
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
  const token = signToken(user);

  return { user, token };
}

export async function getUserById(userId) {
  const { rows } = await query(
    `SELECT id, username, email, display_name, avatar_url, bio, reputation,
            follower_count, following_count, created_at
     FROM users WHERE id = $1`,
    [userId]
  );

  return rows[0] ? sanitizeUser(rows[0]) : null;
}
