import http from 'http';
import express from 'express';
import dotenv from 'dotenv';
import apiRouter from './routes/index.js';
import { checkConnection } from './config/database.js';
import { errorHandler, notFound } from './middleware/errorHandler.js';
import { AI_PROVIDER } from './services/ai/index.js';
import { startScheduledJobs } from './jobs/scheduler.js';
import { UPLOAD_DIR } from './config/upload.js';
import { initSocket } from './services/socketService.js';
import { connectRedis } from './config/redis.js';
import { logger } from './utils/logger.js';
import { metricsMiddleware, metricsHandler } from './observability/metrics.js';
import { securityHeaders } from './middleware/security.js';
import { corsMiddleware } from './middleware/cors.js';
import { sanitizeBody } from './middleware/validate.js';

dotenv.config();

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT ?? 3000;

app.set('trust proxy', 1);
app.use(securityHeaders());
app.use(corsMiddleware());
app.use(express.json({ limit: '1mb' }));
app.use(sanitizeBody);
app.use(metricsMiddleware);
app.use('/uploads', express.static(UPLOAD_DIR));

app.get('/', (_req, res) => {
  res.json({
    name: 'Status API',
    version: '0.3.0',
    docs: '/api/v1/health',
    metrics: '/metrics',
    websocket: '/socket.io',
  });
});

app.get('/metrics', metricsHandler);

app.use('/api/v1', apiRouter);

app.use(notFound);
app.use(errorHandler);

initSocket(server);

async function start() {
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
  } catch (err) {
    logger.warn('Database not reachable — API will start but DB routes will fail.');
    logger.warn(err.message);
  }

  server.listen(PORT, () => {
    logger.info(`Status API listening on http://localhost:${PORT}`);
    logger.info(`WebSocket ready on ws://localhost:${PORT}/socket.io`);
  });
}

start();

export default app;
