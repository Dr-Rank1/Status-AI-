import { query } from '../config/database.js';
import { ensureEnergyState, getEnergyState } from './energyService.js';

const MOCK_USERNAME = process.env.MOCK_SESSION_USERNAME ?? 'player_one';

let cachedSessionUser = null;

export async function initSessionUser() {
  const { rows } = await query(
    `SELECT id, username, display_name, avatar_url, bio, reputation,
            follower_count, following_count, created_at
     FROM users
     WHERE username = $1`,
    [MOCK_USERNAME]
  );

  if (rows.length === 0) {
    console.warn(`Mock session user "${MOCK_USERNAME}" not found. Run schema.sql seed data.`);
    return null;
  }

  cachedSessionUser = rows[0];
  await ensureEnergyState(cachedSessionUser.id);
  console.log(`Mock session active: ${cachedSessionUser.display_name} (@${cachedSessionUser.username})`);
  return cachedSessionUser;
}

export function getCachedSessionUser() {
  return cachedSessionUser;
}

export async function resolveSessionUser(req) {
  const headerUserId = req.headers['x-user-id'];
  if (headerUserId) {
    const { rows } = await query(
      `SELECT id, username, display_name, avatar_url, bio, reputation,
              follower_count, following_count, created_at
       FROM users WHERE id = $1`,
      [headerUserId]
    );
    if (rows.length > 0) {
      await ensureEnergyState(rows[0].id);
      return rows[0];
    }
  }

  if (cachedSessionUser) {
    return cachedSessionUser;
  }

  return initSessionUser();
}

export async function getSessionPayload(userId) {
  const { rows } = await query(
    `SELECT id, username, display_name, avatar_url, bio, reputation,
            follower_count, following_count, created_at
     FROM users WHERE id = $1`,
    [userId]
  );

  if (rows.length === 0) return null;

  const energy = await getEnergyState(userId);
  return { user: rows[0], energy };
}
