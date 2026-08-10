import { query } from '../config/database.js';
import {
  listExploreCharacters,
  followCharacter,
  unfollowCharacter,
  getRelationship,
} from '../services/relationshipService.js';

export async function listCharacters(_req, res) {
  const { rows } = await query(
    `SELECT id, name, handle, avatar_url, bio, fandom, follower_count, is_active
     FROM ai_characters
     WHERE is_active = TRUE
     ORDER BY follower_count DESC`
  );
  res.json({ data: rows });
}

export async function exploreCharacters(req, res) {
  const result = await listExploreCharacters(req.user.id);
  res.json({ data: result });
}

export async function getCharacter(req, res) {
  const { rows } = await query(
    `SELECT id, name, handle, avatar_url, bio, fandom, personality,
            follower_count, is_active, created_at
     FROM ai_characters
     WHERE id = $1`,
    [req.params.id]
  );

  if (rows.length === 0) {
    return res.status(404).json({ error: 'Character not found' });
  }

  const relationship = await getRelationship(req.user.id, req.params.id);

  res.json({
    data: {
      ...rows[0],
      affinity: relationship.affinity ?? 0,
      is_following: relationship.is_following ?? false,
    },
  });
}

export async function follow(req, res) {
  const result = await followCharacter(req.user.id, req.params.id);
  res.json({ data: result });
}

export async function unfollow(req, res) {
  const result = await unfollowCharacter(req.user.id, req.params.id);
  res.json({ data: result });
}
