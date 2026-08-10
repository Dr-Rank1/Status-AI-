/**
 * Phase 35 — Real-time multi-modal WebRTC avatar / spatial-audio streaming.
 * Signaling over Socket.IO; media can ride LiveKit or peer connections.
 */

import crypto from 'crypto';
import { getIO } from '../socketService.js';
import { generateLiveKitToken } from '../liveStreamService.js';
import { logger } from '../../utils/logger.js';
import { AppError } from '../../utils/errors.js';

const sessions = new Map();

export function getWebrtcConfig() {
  return {
    enabled: process.env.WEBRTC_AVATAR_STREAM_ENABLED !== 'false',
    signaling: 'socket.io',
    mediaBackend: process.env.LIVEKIT_URL ? 'livekit' : 'p2p-datachannel',
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      ...(process.env.WEBRTC_TURN_URL
        ? [{
            urls: process.env.WEBRTC_TURN_URL,
            username: process.env.WEBRTC_TURN_USER,
            credential: process.env.WEBRTC_TURN_PASS,
          }]
        : []),
    ],
  };
}

/**
 * Create a multi-modal stream session (avatar animation + spatial audio).
 */
export async function createAvatarStreamSession({
  userId,
  characterId,
  modalities = ['avatar3d', 'spatial_audio', 'text'],
  threadId = null,
}) {
  const cfg = getWebrtcConfig();
  if (!cfg.enabled) {
    throw new AppError('WebRTC avatar streaming disabled', 503, 'WEBRTC_DISABLED');
  }

  const sessionId = crypto.randomUUID();
  const roomName = `avatar-${sessionId.slice(0, 8)}`;

  let livekit = null;
  if (process.env.LIVEKIT_URL && process.env.LIVEKIT_API_KEY) {
    try {
      const token = await generateLiveKitToken({
        roomName,
        identity: `user-${userId}`,
        canPublish: true,
      });
      const publisherToken = await generateLiveKitToken({
        roomName,
        identity: `avatar-${characterId ?? 'agent'}`,
        canPublish: true,
      });
      livekit = {
        url: process.env.LIVEKIT_URL,
        viewerToken: token,
        publisherToken,
        roomName,
      };
    } catch (err) {
      logger.warn(`[WebRTC] LiveKit token failed: ${err.message}`);
    }
  }

  const session = {
    id: sessionId,
    userId,
    characterId,
    threadId,
    modalities,
    roomName,
    livekit,
    iceServers: cfg.iceServers,
    signaling: cfg.signaling,
    createdAt: new Date().toISOString(),
    status: 'open',
  };

  sessions.set(sessionId, session);
  logger.info(`[WebRTC] session ${sessionId} modalities=${modalities.join('+')}`);
  return session;
}

export function getAvatarStreamSession(sessionId) {
  const s = sessions.get(sessionId);
  if (!s) throw new AppError('WebRTC session not found', 404, 'WEBRTC_SESSION_NOT_FOUND');
  return s;
}

/**
 * Relay SDP / ICE via Socket.IO rooms (zero REST polling).
 */
export function signalAvatarStream({ sessionId, from, type, payload }) {
  const session = getAvatarStreamSession(sessionId);
  const io = getIO();
  if (!io) {
    throw new AppError('Socket.IO not ready', 503, 'SOCKET_UNAVAILABLE');
  }

  const envelope = {
    sessionId,
    from,
    type, // offer | answer | ice | avatar_frame | spatial_audio | close
    payload,
    at: Date.now(),
  };

  io.to(`webrtc:${sessionId}`).emit('webrtc_signal', envelope);

  if (type === 'close') {
    session.status = 'closed';
  }

  return { relayed: true, sessionId };
}

/**
 * Push synthesized avatar animation / audio cue without full renegotiation.
 */
export function pushMultimodalFrame({
  sessionId,
  avatar = null,
  spatialAudio = null,
  textDelta = null,
}) {
  const session = getAvatarStreamSession(sessionId);
  const io = getIO();
  if (!io) return { emitted: false };

  io.to(`webrtc:${sessionId}`).emit('webrtc_multimodal', {
    sessionId,
    characterId: session.characterId,
    avatar, // e.g. { blendshapes, boneRotations, fps }
    spatialAudio, // e.g. { pcmBase64, sampleRate, position: {x,y,z} }
    textDelta,
    at: Date.now(),
  });

  return { emitted: true };
}

export function registerWebrtcSocketHandlers(socket) {
  socket.on('join_webrtc', (sessionId) => {
    if (typeof sessionId === 'string' && sessions.has(sessionId)) {
      socket.join(`webrtc:${sessionId}`);
      socket.emit('webrtc_joined', { sessionId, config: getWebrtcConfig() });
    }
  });

  socket.on('leave_webrtc', (sessionId) => {
    if (typeof sessionId === 'string') socket.leave(`webrtc:${sessionId}`);
  });

  socket.on('webrtc_signal', (msg) => {
    try {
      if (!msg?.sessionId) return;
      signalAvatarStream({
        sessionId: msg.sessionId,
        from: socket.user?.id ?? socket.id,
        type: msg.type,
        payload: msg.payload,
      });
    } catch (err) {
      socket.emit('webrtc_error', { code: err.code ?? 'WEBRTC_SIGNAL_ERROR', message: err.message });
    }
  });
}
