import { checkConnection } from '../config/database.js';
import { getRedis } from '../config/redis.js';

/**
 * Liveness probe — process is running.
 */
export function live(_req, res) {
  res.json({
    status: 'ok',
    service: 'status-api',
    timestamp: new Date().toISOString(),
  });
}

/**
 * Readiness probe — dependencies reachable for traffic routing.
 */
export async function ready(_req, res) {
  const checks = {
    database: 'unknown',
    redis: 'unknown',
  };

  try {
    await checkConnection();
    checks.database = 'ok';
  } catch {
    checks.database = 'fail';
  }

  if (!process.env.REDIS_URL) {
    checks.redis = 'skipped';
  } else {
    const redis = getRedis();
    try {
      if (redis?.isReady) {
        await redis.ping();
        checks.redis = 'ok';
      } else {
        checks.redis = 'fail';
      }
    } catch {
      checks.redis = 'fail';
    }
  }

  const redisOk = checks.redis === 'ok' || checks.redis === 'skipped';
  const isReady = checks.database === 'ok' && redisOk;

  res.status(isReady ? 200 : 503).json({
    status: isReady ? 'ready' : 'degraded',
    service: 'status-api',
    checks,
    uptime_seconds: Math.floor(process.uptime()),
    memory: process.memoryUsage(),
    timestamp: new Date().toISOString(),
  });
}
