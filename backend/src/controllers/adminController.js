import { query } from '../config/database.js';
import { validationError } from '../utils/errors.js';

export async function upsertCharacter(req, res) {
  const {
    id,
    name,
    handle,
    fandom,
    bio,
    avatarUrl,
    personality,
    systemPrompt,
    isActive,
  } = req.body;

  if (!name || !handle || !fandom) {
    throw validationError('name, handle, and fandom are required');
  }

  const normalizedHandle = handle.toLowerCase().replace(/^@/, '');
  const personalityPayload = {
    ...(personality ?? {}),
    ...(systemPrompt ? { system_prompt: systemPrompt } : {}),
  };

  if (id) {
    const { rows } = await query(
      `UPDATE ai_characters
       SET name = COALESCE($1, name),
           handle = COALESCE($2, handle),
           fandom = COALESCE($3, fandom),
           bio = COALESCE($4, bio),
           avatar_url = COALESCE($5, avatar_url),
           personality = COALESCE($6::jsonb, personality),
           is_active = COALESCE($7, is_active),
           updated_at = NOW()
       WHERE id = $8
       RETURNING id, name, handle, avatar_url, bio, fandom, personality, follower_count, is_active, created_at, updated_at`,
      [
        name,
        normalizedHandle,
        fandom,
        bio ?? null,
        avatarUrl ?? null,
        JSON.stringify(personalityPayload),
        isActive ?? null,
        id,
      ]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Character not found' });
    }

    return res.json({ data: rows[0], action: 'updated' });
  }

  const { rows } = await query(
    `INSERT INTO ai_characters (name, handle, fandom, bio, avatar_url, personality, is_active)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb, COALESCE($7, TRUE))
     ON CONFLICT (handle)
     DO UPDATE SET
       name = EXCLUDED.name,
       fandom = EXCLUDED.fandom,
       bio = EXCLUDED.bio,
       avatar_url = EXCLUDED.avatar_url,
       personality = EXCLUDED.personality,
       is_active = EXCLUDED.is_active,
       updated_at = NOW()
     RETURNING id, name, handle, avatar_url, bio, fandom, personality, follower_count, is_active, created_at, updated_at`,
    [
      name,
      normalizedHandle,
      fandom,
      bio ?? null,
      avatarUrl ?? null,
      JSON.stringify(personalityPayload),
      isActive ?? true,
    ]
  );

  res.status(201).json({ data: rows[0], action: 'created' });
}

export async function listAllCharacters(_req, res) {
  const { rows } = await query(
    `SELECT id, name, handle, avatar_url, bio, fandom, personality, follower_count, is_active, created_at, updated_at
     FROM ai_characters
     ORDER BY fandom, name`
  );
  res.json({ data: rows });
}
