import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import apiRouter from './routes/index.js';
import { checkConnection } from './config/database.js';
import { errorHandler, notFound } from './middleware/errorHandler.js';
import { AI_PROVIDER } from './services/ai/index.js';
import { startScheduledJobs } from './jobs/scheduler.js';
import { UPLOAD_DIR } from './config/upload.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT ?? 3000;

app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(UPLOAD_DIR));

app.get('/', (_req, res) => {
  res.json({
    name: 'Status API',
    version: '0.2.0',
    docs: '/api/v1/health',
  });
});

app.use('/api/v1', apiRouter);

app.use(notFound);
app.use(errorHandler);

async function start() {
  try {
    const db = await checkConnection();
    console.log(`PostgreSQL connected at ${db.now}`);
    console.log(`AI provider: ${AI_PROVIDER}`);
    startScheduledJobs();
  } catch (err) {
    console.warn('Database not reachable — API will start but DB routes will fail.');
    console.warn(err.message);
  }

  app.listen(PORT, () => {
    console.log(`Status API listening on http://localhost:${PORT}`);
  });
}

start();

export default app;
