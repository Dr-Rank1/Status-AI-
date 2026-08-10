import pool from '../config/database.js';
import { ENERGY_COSTS, spendEnergy } from '../services/energyService.js';
import { requireContentModeration } from '../middleware/moderation.js';
import { validationError } from '../utils/errors.js';
import {
  createLiveSession,
  getLiveSession,
  listActiveLiveSessions,
  insertLiveChatMessage,
  getRecentLiveChat,
  endLiveSession,
  generateLiveKitToken,
} from '../services/liveStreamService.js';
import { processLiveViewerMessage } from '../services/liveAiBroadcastService.js';

export async function listSessions(_req, res) {
  const sessions = await listActiveLiveSessions();
  res.json({ data: sessions });
}

export async function createSession(req, res) {
  const { characterId, title } = req.body;
  const result = await createLiveSession({
    characterId,
    hostUserId: req.user.id,
    title,
  });
  res.status(201).json({ data: result });
}

export async function getSession(req, res) {
  const session = await getLiveSession(req.params.sessionId);
  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }

  const token = await generateLiveKitToken({
    roomName: session.livekit_room,
    identity: req.user.id,
    canPublish: false,
  });

  const messages = await getRecentLiveChat(session.id);

  res.json({
    data: {
      session,
      livekitToken: token,
      livekitUrl: process.env.LIVEKIT_URL ?? 'wss://livekit.example.com',
      messages,
    },
  });
}

export async function sendChat(req, res) {
  const { content } = req.body;
  const { sessionId } = req.params;

  if (!content?.trim()) throw validationError('content is required');

  const session = await getLiveSession(sessionId);
  if (!session || session.status !== 'live') {
    return res.status(404).json({ error: 'Live session not found' });
  }

  await requireContentModeration({ userId: req.user.id, text: content });

  const chatMessage = await insertLiveChatMessage({
    sessionId,
    userId: req.user.id,
    content,
    isSuperChat: false,
  });

  await processLiveViewerMessage({
    sessionId,
    userId: req.user.id,
    content,
    isSuperChat: false,
    chatMessage,
  });

  res.status(201).json({ data: chatMessage });
}

export async function sendSuperChat(req, res) {
  const { content } = req.body;
  const { sessionId } = req.params;

  if (!content?.trim()) throw validationError('content is required');

  const session = await getLiveSession(sessionId);
  if (!session || session.status !== 'live') {
    return res.status(404).json({ error: 'Live session not found' });
  }

  await requireContentModeration({ userId: req.user.id, text: content });

  const client = await pool.connect();
  let energyResult;
  let chatMessage;

  try {
    await client.query('BEGIN');
    energyResult = await spendEnergy(req.user.id, 'super_chat', client);
    chatMessage = await insertLiveChatMessage({
      sessionId,
      userId: req.user.id,
      content,
      isSuperChat: true,
      energySpent: energyResult.spent,
      pinDurationMinutes: parseInt(process.env.SUPER_CHAT_PIN_MINUTES ?? '5', 10),
    });
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  await processLiveViewerMessage({
    sessionId,
    userId: req.user.id,
    content,
    isSuperChat: true,
    chatMessage,
  });

  res.status(201).json({
    data: chatMessage,
    energy: energyResult.state,
    spent: energyResult.spent,
    costs: ENERGY_COSTS,
    aiPending: true,
  });
}

export async function endSession(req, res) {
  const session = await getLiveSession(req.params.sessionId);
  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }

  if (session.host_user_id && session.host_user_id !== req.user.id && !req.user.is_admin) {
    return res.status(403).json({ error: 'Not authorized' });
  }

  await endLiveSession(req.params.sessionId);
  res.json({ data: { ended: true } });
}
