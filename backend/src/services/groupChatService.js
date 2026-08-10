import pool, { query } from '../config/database.js';
import { validationError } from '../utils/errors.js';
import { parseMentions } from '../utils/mentions.js';

export async function createGroup({ creatorId, name, characterIds = [], userIds = [] }) {
  if (!name?.trim()) throw validationError('Group name is required');

  const uniqueCharacterIds = [...new Set(characterIds)];
  const uniqueUserIds = [...new Set(userIds.filter((id) => id !== creatorId))];

  if (uniqueCharacterIds.length === 0) {
    throw validationError('At least one AI character is required');
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const groupResult = await client.query(
      `INSERT INTO group_threads (name, created_by, last_message_at)
       VALUES ($1, $2, NOW())
       RETURNING id, name, created_by, last_message_at, created_at`,
      [name.trim(), creatorId]
    );
    const group = groupResult.rows[0];

    await client.query(
      `INSERT INTO group_members (group_id, member_type, user_id)
       VALUES ($1, 'user', $2)`,
      [group.id, creatorId]
    );

    for (const userId of uniqueUserIds) {
      await client.query(
        `INSERT INTO group_members (group_id, member_type, user_id)
         VALUES ($1, 'user', $2)
         ON CONFLICT DO NOTHING`,
        [group.id, userId]
      );
    }

    for (const characterId of uniqueCharacterIds) {
      const charCheck = await client.query(
        `SELECT id FROM ai_characters WHERE id = $1 AND is_active = TRUE`,
        [characterId]
      );
      if (charCheck.rows.length === 0) continue;

      await client.query(
        `INSERT INTO group_members (group_id, member_type, character_id)
         VALUES ($1, 'character', $2)`,
        [group.id, characterId]
      );
    }

    await client.query('COMMIT');
    return getGroupById(group.id, creatorId);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function listGroupsForUser(userId) {
  const { rows } = await query(
    `SELECT
       g.id,
       g.name,
       g.last_message_at,
       g.created_at,
       (
         SELECT content FROM group_messages gm
         WHERE gm.group_id = g.id
         ORDER BY gm.created_at DESC LIMIT 1
       ) AS last_message_preview,
       (
         SELECT COUNT(*)::int FROM group_members gm2
         WHERE gm2.group_id = g.id
       ) AS member_count
     FROM group_threads g
     JOIN group_members m ON m.group_id = g.id AND m.user_id = $1
     ORDER BY g.last_message_at DESC NULLS LAST`,
    [userId]
  );
  return rows;
}

export async function getGroupById(groupId, userId) {
  const membership = await query(
    `SELECT 1 FROM group_members WHERE group_id = $1 AND user_id = $2`,
    [groupId, userId]
  );
  if (membership.rows.length === 0) return null;

  const group = await query(
    `SELECT id, name, created_by, last_message_at, created_at FROM group_threads WHERE id = $1`,
    [groupId]
  );
  if (group.rows.length === 0) return null;

  const members = await query(
    `SELECT
       gm.member_type,
       gm.user_id,
       gm.character_id,
       u.display_name AS user_name,
       u.username AS user_username,
       u.avatar_url AS user_avatar,
       c.name AS character_name,
       c.handle AS character_handle,
       c.avatar_url AS character_avatar,
       c.fandom AS character_fandom
     FROM group_members gm
     LEFT JOIN users u ON gm.user_id = u.id
     LEFT JOIN ai_characters c ON gm.character_id = c.id
     WHERE gm.group_id = $1`,
    [groupId]
  );

  return { ...group.rows[0], members: members.rows };
}

export async function getGroupMessages(groupId, userId) {
  const group = await getGroupById(groupId, userId);
  if (!group) return null;

  const { rows } = await query(
    `SELECT
       gm.id,
       gm.sender_type,
       gm.sender_user_id,
       gm.sender_character_id,
       gm.content,
       gm.created_at,
       u.display_name AS sender_user_name,
       u.username AS sender_user_username,
       c.name AS sender_character_name,
       c.handle AS sender_character_handle,
       c.avatar_url AS sender_character_avatar
     FROM group_messages gm
     LEFT JOIN users u ON gm.sender_user_id = u.id
     LEFT JOIN ai_characters c ON gm.sender_character_id = c.id
     WHERE gm.group_id = $1
     ORDER BY gm.created_at ASC`,
    [groupId]
  );

  return { group, messages: rows };
}

export async function insertGroupMessage({ groupId, userId, content }) {
  const group = await getGroupById(groupId, userId);
  if (!group) return null;

  const inserted = await query(
    `INSERT INTO group_messages (group_id, sender_type, sender_user_id, content)
     VALUES ($1, 'user', $2, $3)
     RETURNING id, sender_type, sender_user_id, sender_character_id, content, created_at`,
    [groupId, userId, content.trim()]
  );

  await query(`UPDATE group_threads SET last_message_at = NOW() WHERE id = $1`, [groupId]);

  const mentionedHandles = parseMentions(content);
  const mentionedCharacters = await resolveMentionedCharacters(groupId, mentionedHandles);

  return {
    message: inserted.rows[0],
    group,
    mentionedCharacters,
  };
}

async function resolveMentionedCharacters(groupId, handles) {
  if (handles.length === 0) {
    const { rows } = await query(
      `SELECT c.id, c.name, c.handle, c.avatar_url, c.fandom, c.bio, c.personality
       FROM group_members gm
       JOIN ai_characters c ON gm.character_id = c.id
       WHERE gm.group_id = $1 AND gm.member_type = 'character'
       LIMIT 1`,
      [groupId]
    );
    return rows;
  }

  const normalized = handles.map((h) => h.toLowerCase());
  const { rows } = await query(
    `SELECT c.id, c.name, c.handle, c.avatar_url, c.fandom, c.bio, c.personality
     FROM group_members gm
     JOIN ai_characters c ON gm.character_id = c.id
     WHERE gm.group_id = $1
       AND gm.member_type = 'character'
       AND LOWER(c.handle) = ANY($2::text[])`,
    [groupId, normalized]
  );
  return rows;
}

export async function getGroupMemberUserIds(groupId) {
  const { rows } = await query(
    `SELECT user_id FROM group_members WHERE group_id = $1 AND user_id IS NOT NULL`,
    [groupId]
  );
  return rows.map((r) => r.user_id);
}

export async function buildGroupContext(groupId, limit = 20) {
  const { rows } = await query(
    `SELECT
       gm.sender_type,
       gm.content,
       u.display_name AS user_name,
       c.name AS character_name
     FROM group_messages gm
     LEFT JOIN users u ON gm.sender_user_id = u.id
     LEFT JOIN ai_characters c ON gm.sender_character_id = c.id
     WHERE gm.group_id = $1
     ORDER BY gm.created_at DESC
     LIMIT $2`,
    [groupId, limit]
  );
  return rows.reverse();
}
