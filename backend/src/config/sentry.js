import * as Sentry from '@sentry/node';
import { expressIntegration } from '@sentry/node';

export function initSentry() {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) return false;

  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV ?? 'development',
    release: process.env.SENTRY_RELEASE ?? 'status-backend@0.1.0',
    tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? '0.1'),
    sendDefaultPii: false,
    integrations: [expressIntegration()],
  });

  return true;
}

export { Sentry };
export { setupExpressErrorHandler } from '@sentry/node';
