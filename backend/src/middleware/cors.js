import cors from 'cors';

function parseOrigins() {
  const raw = process.env.CORS_ORIGINS ?? '';
  return raw
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}

/**
 * Strict CORS — production requires explicit CORS_ORIGINS.
 * Development allows all origins when unset.
 */
export function corsMiddleware() {
  const allowedOrigins = parseOrigins();
  const isProduction = process.env.NODE_ENV === 'production';

  return cors({
    origin(origin, callback) {
      if (!origin) {
        return callback(null, true);
      }

      if (allowedOrigins.length === 0) {
        if (isProduction) {
          return callback(new Error('CORS origin not allowed'));
        }
        return callback(null, true);
      }

      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      return callback(new Error('CORS origin not allowed'));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    maxAge: 86400,
  });
}

export function getSocketCorsOrigins() {
  const allowedOrigins = parseOrigins();
  if (allowedOrigins.length === 0) {
    return process.env.NODE_ENV === 'production' ? false : '*';
  }
  return allowedOrigins;
}
