/**
 * Phase 39 — Holographic swarm spatial presence events (OpenXR / Flutter consumers).
 */

import { getIO } from '../socketService.js';
import { logger } from '../../utils/logger.js';

/** Canonical 3D layout for agent holograms in spatial UI (meters, OpenXR coords). */
export const HOLOGRAM_LAYOUT = {
  'status.puppeteer': { x: 0, y: 1.6, z: -1.2, color: '#94a3b8', mesh: 'orb_conductor' },
  'status.research': { x: -0.55, y: 1.55, z: -1.35, color: '#38bdf8', mesh: 'orb_research' },
  'status.dialogue': { x: 0.55, y: 1.55, z: -1.35, color: '#a78bfa', mesh: 'orb_dialogue' },
  'status.tools': { x: -0.85, y: 1.35, z: -1.1, color: '#34d399', mesh: 'orb_tools' },
  'status.transaction': { x: 0.85, y: 1.35, z: -1.1, color: '#fbbf24', mesh: 'orb_tx' },
};

const recentEvents = [];

export function emitSwarmTopologyEvent(event) {
  const envelope = {
    ...event,
    layout: HOLOGRAM_LAYOUT,
    at: Date.now(),
    protocol: 'openxr-hologram/v1',
  };
  recentEvents.push(envelope);
  if (recentEvents.length > 100) recentEvents.shift();

  try {
    const io = getIO();
    if (io) {
      io.to('swarm:hologram').emit('swarm_hologram_event', envelope);
      if (event.topologyId) {
        io.to(`swarm:topology:${event.topologyId}`).emit('swarm_hologram_event', envelope);
      }
    }
  } catch {
    /* socket optional */
  }

  logger.info(`[Hologram] ${event.type} ${event.from ?? ''}→${event.to ?? event.agentId ?? ''}`);
  return envelope;
}

export function getHologramConfig() {
  return {
    protocol: 'openxr-hologram/v1',
    layout: HOLOGRAM_LAYOUT,
    animations: ['beam_transfer', 'activate_pulse', 'quarantine_fade'],
    recent: recentEvents.slice(-20),
  };
}

export function registerHologramSocketHandlers(socket) {
  socket.on('join_swarm_hologram', (topologyId) => {
    socket.join('swarm:hologram');
    if (typeof topologyId === 'string') socket.join(`swarm:topology:${topologyId}`);
    socket.emit('swarm_hologram_config', getHologramConfig());
  });

  socket.on('leave_swarm_hologram', (topologyId) => {
    socket.leave('swarm:hologram');
    if (typeof topologyId === 'string') socket.leave(`swarm:topology:${topologyId}`);
  });
}
