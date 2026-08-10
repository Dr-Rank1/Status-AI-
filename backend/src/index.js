import http from 'http';
import express from 'express';
import dotenv from 'dotenv';
import publicRouter from './routes/public.js';
import apiRouter from './routes/index.js';
import apiV2Router from './routes/v2/index.js';
import { mountDeveloperPortal } from './config/swagger.js';
import { checkConnection } from './config/database.js';
import { errorHandler, notFound } from './middleware/errorHandler.js';
import { AI_PROVIDER } from './services/ai/index.js';
import { startScheduledJobs } from './jobs/scheduler.js';
import { UPLOAD_DIR } from './config/upload.js';
import { initSocket } from './services/socketService.js';
import { connectRedis } from './config/redis.js';
import { logger } from './utils/logger.js';
import { metricsMiddleware, metricsHandler } from './observability/metrics.js';
import { slaMiddleware } from './middleware/slaMiddleware.js';
import { securityHeaders } from './middleware/security.js';
import { corsMiddleware } from './middleware/cors.js';
import { sanitizeBody } from './middleware/validate.js';
import { initSentry, setupExpressErrorHandler } from './config/sentry.js';
import { shutdownPostHog } from './services/posthogService.js';
import { sentryRequestMiddleware } from './middleware/errorHandler.js';
import { regionMiddleware } from './middleware/region.js';
import { connectEventStream, disconnectEventStream } from './services/eventStreamService.js';
import { logRegionStartup } from './config/region.js';
import { payloadShapeGuard, captureErrorForHealing } from './middleware/selfHealing.js';
import { selfHealingFallbackMiddleware } from './services/selfHealing/selfHealingRegistry.js';
import { startSelfHealingDaemon } from './workers/selfHealingDaemon.js';
import {
  tenantResolverMiddleware,
  tenantScopeMiddleware,
  validateUserTenantMiddleware,
} from './middleware/tenant.js';
import { sovereignMiddleware } from './services/sovereign/sovereignCloudService.js';
import { aipsMiddleware } from './services/security/aipsService.js';
import { qkdMiddleware } from './services/security/qkdService.js';
import { blueGreenMiddleware } from './services/traffic/blueGreenTrafficService.js';

dotenv.config();

initSentry();

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT ?? 3000;

app.set('trust proxy', 1);
app.use(securityHeaders());
app.use(corsMiddleware());
app.use(express.json({
  limit: '1mb',
  verify: (req, _res, buf) => {
    if (req.url?.includes('/webhooks/revenuecat')) {
      req.rawBody = buf;
    }
  },
}));
app.use(sanitizeBody);
app.use(payloadShapeGuard);
app.use(metricsMiddleware);
app.use(slaMiddleware);
app.use(regionMiddleware);
app.use(sovereignMiddleware);
app.use(qkdMiddleware);
app.use(blueGreenMiddleware);
app.use(aipsMiddleware);
app.use(sentryRequestMiddleware());
app.use('/uploads', express.static(UPLOAD_DIR));

app.get('/', (_req, res) => {
  res.json({
    name: 'Status API',
    version: '2.0.0',
    docs: '/api/docs',
    api: {
      v1: '/api/v1',
      v2: '/api/v2',
      public: '/api/v1/public',
      ga: process.env.V2_GA_ENABLED === 'true',
    },
    metrics: '/metrics',
    websocket: '/socket.io',
  });
});

app.get('/metrics', metricsHandler);

mountDeveloperPortal(app);

app.use(tenantResolverMiddleware);
app.use(tenantScopeMiddleware);

app.use('/api/v1/public', publicRouter);
app.use(selfHealingFallbackMiddleware);
app.use('/api/v1', apiRouter);
app.use('/api/v2', apiV2Router);

if (process.env.SENTRY_DSN) {
  setupExpressErrorHandler(app);
}

app.use(notFound);
app.use(captureErrorForHealing);
app.use(errorHandler);

initSocket(server);

async function start() {
  await logRegionStartup();

  try {
    await connectEventStream();
  } catch (err) {
    logger.warn('[EventStream] Startup skipped:', err.message);
  }

  try {
    await connectRedis();
  } catch (err) {
    logger.warn('[Redis] Not connected — continuing without cache:', err.message);
  }

  try {
    const db = await checkConnection();
    logger.info(`PostgreSQL connected at ${db.now}`);
    logger.info(`AI provider: ${AI_PROVIDER}`);
    startScheduledJobs();
    await startSelfHealingDaemon();
    try {
      const { initKnowledgeMesh } = await import('./services/knowledgeMesh/knowledgeMeshService.js');
      const mesh = await initKnowledgeMesh();
      logger.info(`[KnowledgeMesh] backend=${mesh.backend}`);
      if (mesh.backend === 'neo4j') {
        const { ensureTemporalGraphSchema } = await import('./services/context/temporalKnowledgeGraph.js');
        await ensureTemporalGraphSchema();
      }
    } catch (err) {
      logger.warn('[KnowledgeMesh] init skipped:', err.message);
    }
    try {
      const { initEdgeVectorStore } = await import('./services/edge/edgeVectorStore.js');
      const edge = await initEdgeVectorStore();
      logger.info(`[EdgeVector] backend=${edge.backend} ready=${edge.ready}`);
    } catch (err) {
      logger.warn('[EdgeVector] init skipped:', err.message);
    }
  } catch (err) {
    logger.warn('Database not reachable — API will start but DB routes will fail.');
    logger.warn(err.message);
  }

  server.listen(PORT, () => {
    logger.info(`Status API listening on http://localhost:${PORT}`);
    logger.info(`WebSocket ready on ws://localhost:${PORT}/socket.io`);
    logger.info('API v2 beta at /api/v2');
  });

  const shutdown = async () => {
    await disconnectEventStream();
    await shutdownPostHog();
    try {
      const { shutdownKnowledgeMesh } = await import('./services/knowledgeMesh/knowledgeMeshService.js');
      await shutdownKnowledgeMesh();
    } catch {
      // ignore
    }
    process.exit(0);
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

start();

export default app;
