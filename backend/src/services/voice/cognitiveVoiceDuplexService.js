/**
 * Phase 39 — Cognitive-voice full-duplex streaming with bio-adaptive prosody.
 */

import crypto from 'crypto';
import { getIO } from '../socketService.js';
import { assessCognitiveState, modulateCognitiveControls } from '../cognitive/bioAdaptiveService.js';
import { logger } from '../../utils/logger.js';
import { AppError } from '../../utils/errors.js';

const sessions = new Map();

/**
 * Map cognitive load → speaking rate, vocabulary complexity, barge-in sensitivity.
 */
export function deriveVoiceProsody(controls) {
  const load = controls?.state?.cognitiveLoad ?? 0.3;
  const fatigue = controls?.state?.fatigue ?? 0.2;

  // Higher load → slower, simpler, easier to interrupt
  const wordsPerMinute = Math.round(165 - load * 55 - fatigue * 25);
  const vocabularyComplexity = clamp(1 - load * 0.7 - fatigue * 0.2, 0.2, 1);
  const bargeInThreshold = clamp(0.35 + load * 0.45, 0.3, 0.9); // higher = easier interrupt
  const pauseMs = Math.round(180 + load * 320);

  return {
    wordsPerMinute: clamp(wordsPerMinute, 90, 180),
    vocabularyComplexity,
    bargeInThreshold,
    pauseMs,
    interruptible: true,
    duplex: true,
    style: load >= 0.65 ? 'calm_simple' : fatigue >= 0.6 ? 'gentle' : 'natural',
  };
}

function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n));
}

export function createDuplexVoiceSession({
  userId,
  characterId = null,
  bci = {},
  biometrics = {},
}) {
  const state = assessCognitiveState({ bci, biometrics });
  const controls = modulateCognitiveControls(state);
  const prosody = deriveVoiceProsody(controls);
  const sessionId = crypto.randomUUID();

  const session = {
    id: sessionId,
    userId,
    characterId,
    prosody,
    controls,
    status: 'open',
    duplex: true,
    createdAt: new Date().toISOString(),
    interrupted: false,
  };
  sessions.set(sessionId, session);
  logger.info(`[CognitiveVoice] session ${sessionId.slice(0, 8)} wpm=${prosody.wordsPerMinute}`);
  return session;
}

export function getDuplexSession(sessionId) {
  const s = sessions.get(sessionId);
  if (!s) throw new AppError('Voice session not found', 404, 'VOICE_SESSION_NOT_FOUND');
  return s;
}

/**
 * Push agent audio / text chunk; client may barge-in anytime.
 */
export function pushDuplexAgentChunk({
  sessionId,
  textDelta = null,
  pcmBase64 = null,
  isFinal = false,
}) {
  const session = getDuplexSession(sessionId);
  if (session.status === 'closed') return { emitted: false };

  const io = getIO();
  const payload = {
    sessionId,
    direction: 'agent',
    textDelta,
    pcmBase64,
    isFinal,
    prosody: session.prosody,
    at: Date.now(),
  };

  if (io) {
    io.to(`voice:duplex:${sessionId}`).emit('voice_duplex_chunk', payload);
  }
  return { emitted: Boolean(io), payload };
}

/**
 * User barge-in — cancel agent TTS immediately (full duplex).
 */
export function handleUserBargeIn({ sessionId, energy = 0.5 }) {
  const session = getDuplexSession(sessionId);
  if (energy < session.prosody.bargeInThreshold * 0.5) {
    return { accepted: false, reason: 'below_threshold' };
  }

  session.interrupted = true;
  const io = getIO();
  if (io) {
    io.to(`voice:duplex:${sessionId}`).emit('voice_duplex_interrupt', {
      sessionId,
      at: Date.now(),
      prosody: session.prosody,
    });
  }
  logger.info(`[CognitiveVoice] barge-in session=${sessionId.slice(0, 8)}`);
  return { accepted: true, interrupted: true };
}

/**
 * Update prosody live from fresh biometrics.
 */
export function updateDuplexProsody(sessionId, { bci = {}, biometrics = {} } = {}) {
  const session = getDuplexSession(sessionId);
  const state = assessCognitiveState({ bci, biometrics });
  const controls = modulateCognitiveControls(state);
  session.controls = controls;
  session.prosody = deriveVoiceProsody(controls);
  const io = getIO();
  if (io) {
    io.to(`voice:duplex:${sessionId}`).emit('voice_duplex_prosody', {
      sessionId,
      prosody: session.prosody,
      at: Date.now(),
    });
  }
  return session.prosody;
}

export function closeDuplexSession(sessionId) {
  const session = getDuplexSession(sessionId);
  session.status = 'closed';
  return { closed: true };
}

export function registerDuplexVoiceSocketHandlers(socket) {
  socket.on('join_voice_duplex', (sessionId) => {
    if (typeof sessionId === 'string' && sessions.has(sessionId)) {
      socket.join(`voice:duplex:${sessionId}`);
      socket.emit('voice_duplex_joined', { sessionId, session: sessions.get(sessionId) });
    }
  });

  socket.on('voice_duplex_barge_in', (msg) => {
    try {
      const result = handleUserBargeIn({
        sessionId: msg?.sessionId,
        energy: msg?.energy ?? 0.7,
      });
      socket.emit('voice_duplex_barge_result', result);
    } catch (err) {
      socket.emit('voice_duplex_error', { message: err.message });
    }
  });

  socket.on('voice_duplex_user_chunk', (msg) => {
    if (!msg?.sessionId) return;
    const io = getIO();
    io?.to(`voice:duplex:${msg.sessionId}`).emit('voice_duplex_chunk', {
      sessionId: msg.sessionId,
      direction: 'user',
      pcmBase64: msg.pcmBase64,
      textDelta: msg.textDelta,
      at: Date.now(),
    });
  });
}

export function getCognitiveVoiceConfig() {
  return {
    duplex: true,
    interruptible: true,
    bioAdaptive: true,
    transport: 'socket.io',
  };
}
