import { query } from '../config/database.js';
import {
  listExploreCharacters,
  followCharacter,
  unfollowCharacter,
  getRelationship,
} from '../services/relationshipService.js';
import { validationError } from '../utils/errors.js';
import { rewardCreatorOnInteraction } from '../services/creatorRewardService.js';

export async function createCharacter(req, res) {
  const { name, handle, fandom, bio, avatarUrl, personality, systemPrompt, publish } = req.body;

  if (!name || !handle || !fandom) {
    throw validationError('name, handle, and fandom are required');
  }

  const normalizedHandle = handle.toLowerCase().replace(/^@/, '');
  const personalityPayload = {
    ...(personality ?? {}),
    ...(systemPrompt ? { system_prompt: systemPrompt } : {}),
  };

  const { rows } = await query(
    `INSERT INTO ai_characters (
       name, handle, fandom, bio, avatar_url, personality,
       creator_user_id, is_published, is_active
     )
     VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, TRUE)
     RETURNING id, name, handle, avatar_url, bio, fandom, personality,
               follower_count, is_published, creator_user_id, created_at`,
    [
      name.trim(),
      normalizedHandle,
      fandom.trim(),
      bio?.trim() ?? null,
      avatarUrl ?? null,
      JSON.stringify(personalityPayload),
      req.user.id,
      publish !== false,
    ]
  );

  res.status(201).json({ data: rows[0] });
}

export async function listMyCharacters(req, res) {
  const { rows } = await query(
    `SELECT id, name, handle, avatar_url, bio, fandom, personality,
            follower_count, is_published, creator_energy_earned, is_active, created_at
     FROM ai_characters
     WHERE creator_user_id = $1
     ORDER BY created_at DESC`,
    [req.user.id]
  );
  res.json({ data: rows });
}

export async function listCharacters(_req, res) {
  const { rows } = await query(
    `SELECT id, name, handle, avatar_url, bio, fandom, follower_count, is_active
     FROM ai_characters
     WHERE is_active = TRUE
       AND (is_published = TRUE OR creator_user_id IS NULL)
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
  await rewardCreatorOnInteraction({
    characterId: req.params.id,
    actorUserId: req.user.id,
    rewardType: 'follow',
  });
  res.json({ data: result });
}

export async function unfollow(req, res) {
  const result = await unfollowCharacter(req.user.id, req.params.id);
  res.json({ data: result });
}
