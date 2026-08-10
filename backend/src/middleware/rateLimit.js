import { rateLimit } from 'express-rate-limit';
import { RedisStore } from 'rate-limit-redis';
import { getRedis } from '../config/redis.js';

const WINDOW_MS = parseInt(process.env.AI_RATE_LIMIT_WINDOW_MS ?? `${15 * 60 * 1000}`, 10);
const MAX_REQUESTS = parseInt(process.env.AI_RATE_LIMIT_MAX ?? '30', 10);

let _limiter = null;

function buildStore() {
  const redis = getRedis();
  if (!redis) return undefined;

  return new RedisStore({
    sendCommand: (...args) => redis.sendCommand(args),
    prefix: 'rl:ai:',
  });
}

function getLimiter() {
  if (!_limiter) {
    _limiter = rateLimit({
      windowMs: WINDOW_MS,
      max: MAX_REQUESTS,
      standardHeaders: true,
      legacyHeaders: false,
      store: buildStore(),
      keyGenerator: (req) => req.user?.id ?? req.ip,
      message: {
        error: 'RATE_LIMITED',
        message: 'Too many AI requests. Please wait before trying again.',
      },
    });
  }
  return _limiter;
}

export function aiRateLimiter(req, res, next) {
  return getLimiter()(req, res, next);
}
