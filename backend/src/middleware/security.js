import helmet from 'helmet';

/**
 * Security headers for zero-trust API hardening.
 */
export function securityHeaders() {
  const isProduction = process.env.NODE_ENV === 'production';

  return helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    hsts: isProduction
      ? {
          maxAge: 31_536_000,
          includeSubDomains: true,
          preload: true,
        }
      : false,
  });
}
