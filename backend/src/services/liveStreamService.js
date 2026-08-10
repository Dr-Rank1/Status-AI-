import { AccessToken } from 'livekit-server-sdk';
import { query } from '../config/database.js';
import { logger } from '../utils/logger.js';
import { validationError } from '../utils/errors.js';

const LIVEKIT_URL = process.env.LIVEKIT_URL ?? 'wss://livekit.example.com';
const LIVEKIT_API_KEY = process.env.LIVEKIT_API_KEY;
const LIVEKIT_API_SECRET = process.env.LIVEKIT_API_SECRET;

export async function createLiveSession({ characterId, hostUserId, title }) {
  if (!characterId) throw validationError('characterId is required');

  const { rows: chars } = await query(
    `SELECT id, name, handle, simli_face_id FROM ai_characters WHERE id = $1 AND is_active = TRUE`,
    [characterId]
  );
  if (chars.length === 0) throw validationError('Character not found');

  const character = chars[0];
  const roomName = `live-${character.handle}-${Date.now()}`;

  const { rows } = await query(
    `INSERT INTO live_sessions (character_id, host_user_id, title, livekit_room, status)
     VALUES ($1, $2, $3, $4, 'live')
     RETURNING *`,
    [characterId, hostUserId ?? null, title ?? `${character.name} Live`, roomName]
  );

  const session = rows[0];
  const token = await generateLiveKitToken({
    roomName,
    identity: hostUserId ?? `viewer-${Date.now()}`,
    canPublish: true,
  });

  return {
    session,
    character,
    livekitUrl: LIVEKIT_URL,
    livekitToken: token,
    simliFaceId: character.simli_face_id,
  };
}

export async function getLiveSession(sessionId) {
  const { rows } = await query(
    `SELECT ls.*, c.name AS character_name, c.handle AS character_handle, c.simli_face_id
     FROM live_sessions ls
     JOIN ai_characters c ON ls.character_id = c.id
     WHERE ls.id = $1`,
    [sessionId]
  );
  return rows[0] ?? null;
}

export async function listActiveLiveSessions() {
  const { rows } = await query(
    `SELECT ls.*, c.name AS character_name, c.handle AS character_handle, c.avatar_url
     FROM live_sessions ls
     JOIN ai_characters c ON ls.character_id = c.id
     WHERE ls.status = 'live'
     ORDER BY ls.started_at DESC
     LIMIT 20`
  );
  return rows;
}

export async function insertLiveChatMessage({
  sessionId,
  userId,
  content,
  isSuperChat = false,
  energySpent = 0,
  pinDurationMinutes = 5,
}) {
  const pinnedUntil = isSuperChat
    ? new Date(Date.now() + pinDurationMinutes * 60 * 1000).toISOString()
    : null;

  const { rows } = await query(
    `INSERT INTO live_chat_messages (session_id, user_id, content, is_super_chat, energy_spent, pinned_until)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, session_id, user_id, content, is_super_chat, energy_spent, pinned_until, acknowledged, created_at`,
    [sessionId, userId, content.trim(), isSuperChat, energySpent, pinnedUntil]
  );

  const msg = rows[0];
  const { rows: users } = await query(
    `SELECT display_name, username FROM users WHERE id = $1`,
    [userId]
  );

  return { ...msg, display_name: users[0]?.display_name, username: users[0]?.username };
}

export async function getPinnedSuperChats(sessionId) {
  const { rows } = await query(
    `SELECT lcm.*, u.display_name, u.username
     FROM live_chat_messages lcm
     JOIN users u ON lcm.user_id = u.id
     WHERE lcm.session_id = $1
       AND lcm.is_super_chat = TRUE
       AND lcm.acknowledged = FALSE
       AND (lcm.pinned_until IS NULL OR lcm.pinned_until > NOW())
     ORDER BY lcm.energy_spent DESC, lcm.created_at ASC
     LIMIT 10`,
    [sessionId]
  );
  return rows;
}

export async function acknowledgeSuperChats(sessionId, messageIds = []) {
  if (messageIds.length === 0) return;
  await query(
    `UPDATE live_chat_messages SET acknowledged = TRUE
     WHERE session_id = $1 AND id = ANY($2::uuid[])`,
    [sessionId, messageIds]
  );
}

export async function getRecentLiveChat(sessionId, limit = 50) {
  const { rows } = await query(
    `SELECT lcm.*, u.display_name, u.username
     FROM live_chat_messages lcm
     JOIN users u ON lcm.user_id = u.id
     WHERE lcm.session_id = $1
     ORDER BY lcm.created_at DESC
     LIMIT $2`,
    [sessionId, limit]
  );
  return rows.reverse();
}

export async function generateLiveKitToken({ roomName, identity, canPublish = false }) {
  if (!LIVEKIT_API_KEY || !LIVEKIT_API_SECRET) {
    logger.warn('[LiveKit] No API keys — returning mock token');
    return `mock-livekit-token:${roomName}:${identity}`;
  }

  const token = new AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET, {
    identity,
    ttl: '2h',
  });
  token.addGrant({
    roomJoin: true,
    room: roomName,
    canPublish,
    canSubscribe: true,
  });

  return await token.toJwt();
}

export async function endLiveSession(sessionId) {
  await query(
    `UPDATE live_sessions SET status = 'ended', ended_at = NOW() WHERE id = $1`,
    [sessionId]
  );
}
