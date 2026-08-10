import * as Sentry from '@sentry/node';
import { logger } from '../utils/logger.js';

export function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

export function notFound(req, res) {
  res.status(404).json({
    error: 'Not Found',
    message: `Route ${req.method} ${req.path} does not exist`,
  });
}

export function sentryRequestMiddleware() {
  return (req, res, next) => {
    if (process.env.SENTRY_DSN) {
      Sentry.setUser(req.user ? { id: req.user.id, username: req.user.username } : null);
      Sentry.setContext('request', {
        method: req.method,
        path: req.originalUrl ?? req.path,
        ip: req.ip,
      });
    }
    next();
  };
}

export function errorHandler(err, req, res, _next) {
  const status = err.status ?? 500;

  if (process.env.SENTRY_DSN && status >= 500) {
    Sentry.withScope((scope) => {
      if (req.user?.id) {
        scope.setUser({ id: req.user.id, username: req.user.username });
      }
      scope.setContext('request', {
        method: req.method,
        path: req.originalUrl ?? req.path,
        body: req.method !== 'GET' ? req.body : undefined,
      });
      scope.setTag('error_code', err.code ?? err.name ?? 'INTERNAL_ERROR');
      Sentry.captureException(err);
    });
  }

  logger.error(`[Error] ${req.method} ${req.path} → ${status}:`, err.message);

  res.status(status);
  if (err.retryAfter) {
    res.set('Retry-After', String(err.retryAfter));
  }
  res.json({
    error: err.code ?? err.name ?? 'Internal Server Error',
    message: err.message ?? 'Something went wrong',
    ...(err.categories && { categories: err.categories }),
    ...(err.retryAfter && { retryAfter: err.retryAfter }),
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
}
