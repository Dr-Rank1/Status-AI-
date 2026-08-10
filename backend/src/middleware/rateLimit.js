import { rateLimit } from 'express-rate-limit';
import { RedisStore } from 'rate-limit-redis';
import { getRedis } from '../config/redis.js';

const WINDOW_MS = parseInt(process.env.AI_RATE_LIMIT_WINDOW_MS ?? `${15 * 60 * 1000}`, 10);
const MAX_REQUESTS = parseInt(process.env.AI_RATE_LIMIT_MAX ?? '30', 10);

const AUTH_WINDOW_MS = parseInt(process.env.AUTH_RATE_LIMIT_WINDOW_MS ?? `${15 * 60 * 1000}`, 10);
const AUTH_MAX = parseInt(process.env.AUTH_RATE_LIMIT_MAX ?? '10', 10);

const PAYMENT_WINDOW_MS = parseInt(process.env.PAYMENT_RATE_LIMIT_WINDOW_MS ?? `${60 * 60 * 1000}`, 10);
const PAYMENT_MAX = parseInt(process.env.PAYMENT_RATE_LIMIT_MAX ?? '5', 10);

function buildStore(prefix) {
  const redis = getRedis();
  if (!redis) return undefined;

  return new RedisStore({
    sendCommand: (...args) => redis.sendCommand(args),
    prefix,
  });
}

function createLimiter({ windowMs, max, prefix, keyGenerator, message }) {
  return rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    store: buildStore(prefix),
    keyGenerator,
    message,
  });
}

let _aiLimiter = null;
let _authLimiter = null;
let _paymentLimiter = null;

function getAiLimiter() {
  if (!_aiLimiter) {
    _aiLimiter = createLimiter({
      windowMs: WINDOW_MS,
      max: MAX_REQUESTS,
      prefix: 'rl:ai:',
      keyGenerator: (req) => req.user?.id ?? req.ip,
      message: {
        error: 'RATE_LIMITED',
        message: 'Too many AI requests. Please wait before trying again.',
      },
    });
  }
  return _aiLimiter;
}

function getAuthLimiter() {
  if (!_authLimiter) {
    _authLimiter = createLimiter({
      windowMs: AUTH_WINDOW_MS,
      max: AUTH_MAX,
      prefix: 'rl:auth:',
      keyGenerator: (req) => req.ip,
      message: {
        error: 'RATE_LIMITED',
        message: 'Too many authentication attempts. Please try again later.',
      },
    });
  }
  return _authLimiter;
}

function getPaymentLimiter() {
  if (!_paymentLimiter) {
    _paymentLimiter = createLimiter({
      windowMs: PAYMENT_WINDOW_MS,
      max: PAYMENT_MAX,
      prefix: 'rl:payment:',
      keyGenerator: (req) => req.user?.id ?? req.ip,
      message: {
        error: 'RATE_LIMITED',
        message: 'Too many payment requests. Please try again later.',
      },
    });
  }
  return _paymentLimiter;
}

export function aiRateLimiter(req, res, next) {
  return getAiLimiter()(req, res, next);
}

export function authRateLimiter(req, res, next) {
  return getAuthLimiter()(req, res, next);
}

export function paymentRateLimiter(req, res, next) {
  return getPaymentLimiter()(req, res, next);
}
