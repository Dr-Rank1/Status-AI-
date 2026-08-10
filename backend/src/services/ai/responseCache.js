/**
 * Lightweight cache for circuit-breaker AI fallbacks (Redis or in-memory).
 */

import { getRedis } from '../config/redis.js';
import { logger } from '../utils/logger.js';

const MEMORY_CACHE = new Map();
const TTL_SEC = parseInt(process.env.AI_CACHE_TTL_SEC ?? '3600', 10);

function cacheKey(provider, mode, characterId, messageHash) {
  return `ai:cache:${provider}:${mode}:${characterId}:${messageHash}`;
}

function hashMessage(text) {
  if (!text) return 'empty';
  return String(text.length) + ':' + text.slice(0, 64);
}

export async function getCachedAiResponse({ provider, mode, characterId, incomingMessage }) {
  const key = cacheKey(provider, mode, characterId, hashMessage(incomingMessage));
  const redis = getRedis();

  if (redis?.isReady) {
    try {
      const raw = await redis.get(key);
      if (raw) return JSON.parse(raw);
    } catch (err) {
      logger.warn('[AI Cache] Redis read failed:', err.message);
    }
  }

  const entry = MEMORY_CACHE.get(key);
  if (entry && entry.expiresAt > Date.now()) {
    return entry.value;
  }

  return null;
}

export async function setCachedAiResponse({ provider, mode, characterId, incomingMessage, response }) {
  const key = cacheKey(provider, mode, characterId, hashMessage(incomingMessage));
  const payload = { ...response, cachedAt: new Date().toISOString() };
  const redis = getRedis();

  if (redis?.isReady) {
    try {
      await redis.setEx(key, TTL_SEC, JSON.stringify(payload));
      return;
    } catch (err) {
      logger.warn('[AI Cache] Redis write failed:', err.message);
    }
  }

  MEMORY_CACHE.set(key, {
    value: payload,
    expiresAt: Date.now() + TTL_SEC * 1000,
  });
}

export function clearMemoryAiCache() {
  MEMORY_CACHE.clear();
}
