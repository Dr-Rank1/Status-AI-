import { Server } from 'socket.io';
import { query } from '../config/database.js';
import { verifyToken, getUserById } from './authService.js';
import { logger } from '../utils/logger.js';

let io = null;

export function initSocket(httpServer) {
  io = new Server(httpServer, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST'],
    },
    path: '/socket.io',
  });

  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token ?? socket.handshake.query?.token;
      if (!token) {
        return next(new Error('Authentication required'));
      }

      const payload = verifyToken(token);
      const user = await getUserById(payload.userId);
      if (!user) {
        return next(new Error('User not found'));
      }

      socket.user = user;
      next();
    } catch {
      next(new Error('Invalid token'));
    }
  });

  io.on('connection', async (socket) => {
    const room = `user:${socket.user.id}`;
    socket.join(room);
    socket.join('feed');

    try {
      const { rows } = await query(
        `SELECT group_id FROM group_members WHERE user_id = $1`,
        [socket.user.id]
      );
      for (const row of rows) {
        socket.join(`group:${row.group_id}`);
      }
    } catch {
      // group tables may not exist yet
    }

    socket.on('join_group', (groupId) => {
      if (groupId) socket.join(`group:${groupId}`);
    });

    socket.on('join_live', (sessionId) => {
      if (sessionId) socket.join(`live:${sessionId}`);
    });

    socket.emit('connected', { userId: socket.user.id });

    socket.on('disconnect', () => {
      socket.leave(room);
      socket.leave('feed');
    });
  });

  logger.info('[Socket] WebSocket server ready');
  return io;
}

export function getIO() {
  return io;
}

export function emitNewPost(post) {
  if (!io) return;
  io.to('feed').emit('new_post', post);
}

export function emitNewMessage(userId, payload) {
  if (!io) return;
  io.to(`user:${userId}`).emit('new_message', payload);
}

export function emitReputationChange(userId, payload) {
  if (!io) return;
  io.to(`user:${userId}`).emit('reputation_change', payload);
}

export function emitEnergyRecharged(userId, energy) {
  if (!io) return;
  io.to(`user:${userId}`).emit('energy_recharged', {
    energy_remaining: energy.energy_remaining ?? energy.remaining,
    energy_max: energy.energy_max ?? energy.max,
    reset_at: energy.reset_at ?? energy.resetAt,
  });
}

export function emitGroupMessage(groupId, payload) {
  if (!io) return;
  io.to(`group:${groupId}`).emit('group_message', payload);
}

export function emitNarrativeEvent(event) {
  if (!io) return;
  io.to('feed').emit('narrative_event', event);
}

export function emitLiveChat(sessionId, payload) {
  if (!io) return;
  io.to(`live:${sessionId}`).emit('live_chat', payload);
}

export function emitLiveTtsChunk(sessionId, payload) {
  if (!io) return;
  io.to(`live:${sessionId}`).emit('live_tts_chunk', payload);
}

export function emitLiveAiSpeaking(sessionId, payload) {
  if (!io) return;
  io.to(`live:${sessionId}`).emit('live_ai_speaking', payload);
}
