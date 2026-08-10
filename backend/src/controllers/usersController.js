import { query } from '../config/database.js';

export async function listUsers(_req, res) {
  const { rows } = await query(
    `SELECT id, username, display_name, avatar_url, bio, reputation,
            follower_count, following_count, created_at
     FROM users
     ORDER BY created_at DESC`
  );
  res.json({ data: rows });
}

export async function getUser(req, res) {
  const { rows } = await query(
    `SELECT id, username, display_name, avatar_url, bio, reputation,
            follower_count, following_count, created_at
     FROM users
     WHERE id = $1`,
    [req.params.id]
  );

  if (rows.length === 0) {
    return res.status(404).json({ error: 'User not found' });
  }

  res.json({ data: rows[0] });
}

export async function createUser(req, res) {
  const { username, displayName, avatarUrl, bio } = req.body;

  if (!username || !displayName) {
    return res.status(400).json({
      error: 'Validation failed',
      message: 'username and displayName are required',
    });
  }

  const { rows } = await query(
    `INSERT INTO users (username, display_name, avatar_url, bio)
     VALUES ($1, $2, $3, $4)
     RETURNING id, username, display_name, avatar_url, bio, reputation,
               follower_count, following_count, created_at`,
    [username, displayName, avatarUrl ?? null, bio ?? null]
  );

  await query(
    `INSERT INTO energy_state (user_id) VALUES ($1)`,
    [rows[0].id]
  );

  res.status(201).json({ data: rows[0] });
}
