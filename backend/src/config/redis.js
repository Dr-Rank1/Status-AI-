/**
 * Redis client for caching, rate limiting, and WebSocket scaling.
 */

import { logger } from '../utils/logger.js';

let redisClient = null;

export async function connectRedis() {
  const url = process.env.REDIS_URL;
  if (!url) {
    logger.info('[Redis] REDIS_URL not set — skipping connection');
    return null;
  }

  try {
    const { createClient } = await import('redis');
    redisClient = createClient({ url });
    redisClient.on('error', (err) => logger.error('[Redis] Error:', err.message));
    await redisClient.connect();
    logger.info('[Redis] Connected');
    return redisClient;
  } catch (err) {
    logger.warn('[Redis] Failed to connect:', err.message);
    redisClient = null;
    return null;
  }
}

export function getRedis() {
  return redisClient;
}
