/**
 * Phase 30 — Express middleware that feeds SLA telemetry from every HTTP response.
 */

import { recordHttpSample } from '../observability/slaTelemetry.js';

export function slaMiddleware(req, res, next) {
  const start = process.hrtime.bigint();

  res.on('finish', () => {
    const durationMs = Number(process.hrtime.bigint() - start) / 1e6;
    const route = req.route?.path ?? req.path ?? 'unknown';
    recordHttpSample({
      statusCode: res.statusCode,
      durationMs,
      route: `${req.method} ${route}`,
    });
  });

  next();
}
