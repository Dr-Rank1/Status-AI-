/**
 * Prometheus metrics registry and HTTP instrumentation.
 */

import client from 'prom-client';

export const register = new client.Registry();

client.collectDefaultMetrics({
  register,
  labels: { service: 'status-api' },
});

export const httpRequestDuration = new client.Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.005, 0.01, 0.05, 0.1, 0.5, 1, 2, 5],
  registers: [register],
});

export const httpRequestsTotal = new client.Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status_code'],
  registers: [register],
});

/**
 * Express middleware — records request duration and count for Prometheus.
 */
export function metricsMiddleware(req, res, next) {
  const route = req.route?.path ?? req.path;
  const end = httpRequestDuration.startTimer({ method: req.method, route });

  res.on('finish', () => {
    const labels = {
      method: req.method,
      route,
      status_code: String(res.statusCode),
    };
    end(labels);
    httpRequestsTotal.inc(labels);
  });

  next();
}

export async function metricsHandler(_req, res) {
  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
}
