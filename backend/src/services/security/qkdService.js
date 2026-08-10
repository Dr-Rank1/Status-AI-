/**
 * Phase 32 — Quantum Key Distribution (QKD) channel abstraction for system-to-system links.
 * Production: integrate vendor QKD API; here we simulate authenticated key ratcheting
 * over a PQ-hybrid channel using HKDF + HMAC receipts.
 */

import crypto from 'crypto';
import { logger } from '../../utils/logger.js';

const QKD_ENABLED = () => process.env.QKD_ENABLED === 'true';
const QKD_PEPPER = process.env.QKD_PEPPER ?? process.env.PQ_AUTH_PEPPER ?? 'status-qkd-pepper';

/** In-memory channel registry (replace with HSM / QKD appliance session store). */
const channels = new Map();

export function isQkdEnabled() {
  return QKD_ENABLED();
}

/**
 * Establish a QKD-style session between two peer IDs.
 */
export function establishQkdChannel({ localPeerId, remotePeerId, metadata = {} }) {
  const channelId = crypto.randomUUID();
  const rootKey = crypto
    .createHmac('sha512', QKD_PEPPER)
    .update(`${localPeerId}:${remotePeerId}:${channelId}:${Date.now()}`)
    .digest();

  const channel = {
    channelId,
    localPeerId,
    remotePeerId,
    rootKey,
    epoch: 0,
    createdAt: new Date().toISOString(),
    metadata,
    algorithm: process.env.QKD_ALGORITHM ?? 'qkd-sim-hkdf-sha512-v1',
  };

  channels.set(channelId, channel);
  logger.info(`[QKD] Channel established ${channelId} ${localPeerId}↔${remotePeerId}`);
  return {
    channelId,
    algorithm: channel.algorithm,
    createdAt: channel.createdAt,
    epoch: 0,
  };
}

/**
 * Ratchet to next epoch key — mimics continuous QKD key refresh.
 */
export function ratchetQkdKey(channelId) {
  const ch = channels.get(channelId);
  if (!ch) throw new Error('Unknown QKD channel');

  ch.epoch += 1;
  const info = Buffer.from(`qkd-epoch-${ch.epoch}`);
  const next = crypto.hkdfSync('sha512', ch.rootKey, Buffer.alloc(0), info, 64);
  ch.rootKey = Buffer.from(next);

  const receipt = crypto
    .createHmac('sha256', ch.rootKey)
    .update(`receipt:${ch.channelId}:${ch.epoch}`)
    .digest('base64url');

  return {
    channelId,
    epoch: ch.epoch,
    receipt,
    algorithm: ch.algorithm,
  };
}

export function sealWithQkd(channelId, plaintext) {
  const ch = channels.get(channelId);
  if (!ch) throw new Error('Unknown QKD channel');

  const iv = crypto.randomBytes(12);
  const key = crypto.createHash('sha256').update(ch.rootKey).digest();
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  return {
    channelId,
    epoch: ch.epoch,
    iv: iv.toString('base64url'),
    tag: tag.toString('base64url'),
    ciphertext: ct.toString('base64url'),
  };
}

export function openWithQkd(channelId, payload) {
  const ch = channels.get(channelId);
  if (!ch) throw new Error('Unknown QKD channel');
  if (payload.epoch != null && payload.epoch !== ch.epoch) {
    throw new Error('QKD epoch mismatch');
  }

  const key = crypto.createHash('sha256').update(ch.rootKey).digest();
  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    key,
    Buffer.from(payload.iv, 'base64url'),
  );
  decipher.setAuthTag(Buffer.from(payload.tag, 'base64url'));
  const pt = Buffer.concat([
    decipher.update(Buffer.from(payload.ciphertext, 'base64url')),
    decipher.final(),
  ]);
  return pt.toString('utf8');
}

export function getQkdChannel(channelId) {
  const ch = channels.get(channelId);
  if (!ch) return null;
  return {
    channelId: ch.channelId,
    localPeerId: ch.localPeerId,
    remotePeerId: ch.remotePeerId,
    epoch: ch.epoch,
    algorithm: ch.algorithm,
    createdAt: ch.createdAt,
  };
}

export function qkdMiddleware(req, _res, next) {
  const channelId = req.headers['x-status-qkd-channel'];
  if (channelId && channels.has(channelId)) {
    req.qkd = getQkdChannel(channelId);
  }
  next();
}
