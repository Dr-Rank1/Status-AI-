import { rateLimit } from 'express-rate-limit';
import { RedisStore } from 'rate-limit-redis';
import { getRedis } from '../config/redis.js';

const WINDOW_MS = parseInt(process.env.PUBLIC_API_RATE_WINDOW_MS ?? '60000', 10);
const MAX = parseInt(process.env.PUBLIC_API_RATE_MAX ?? '120', 10);

function buildStore() {
  const redis = getRedis();
  if (!redis) return undefined;
  return new RedisStore({
    sendCommand: (...args) => redis.sendCommand(args),
    prefix: 'rl:public:',
  });
}

export const publicApiRateLimiter = rateLimit({
  windowMs: WINDOW_MS,
  max: (req) => req.oauthClient?.rate_limit_max ?? MAX,
  standardHeaders: true,
  legacyHeaders: false,
  store: buildStore(),
  keyGenerator: (req) => req.oauthClient?.client_id ?? req.ip,
  message: {
    error: 'RATE_LIMITED',
    message: 'Public API rate limit exceeded',
  },
});

export const oauthTokenRateLimiter = rateLimit({
  windowMs: WINDOW_MS,
  max: parseInt(process.env.OAUTH_TOKEN_RATE_MAX ?? '20', 10),
  standardHeaders: true,
  legacyHeaders: false,
  store: buildStore(),
  keyGenerator: (req) => req.body?.client_id ?? req.ip,
  message: {
    error: 'RATE_LIMITED',
    message: 'Too many token requests',
  },
});
