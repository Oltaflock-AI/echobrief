import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { logger } from './utils/logger';
import botRouter from './routes/bot';
import { startWorker, getQueue } from './services/orchestrator';
import type { HealthResponse } from './types';

const app = express();
const PORT = parseInt(process.env.PORT ?? '3001', 10);

// ── Middleware ────────────────────────────────────────────────────────────────

app.use(helmet());
app.use(
  cors({
    origin: process.env.CORS_ORIGIN ?? '*',
    methods: ['GET', 'POST'],
  }),
);
app.use(express.json({ limit: '1mb' }));

// ── Health check ──────────────────────────────────────────────────────────────

app.get('/health', async (_req, res) => {
  let redisStatus: 'connected' | 'disconnected' = 'disconnected';
  try {
    const queue = getQueue();
    // Ping Redis via BullMQ queue client
    await (queue as unknown as { client: { ping: () => Promise<unknown> } }).client.ping();
    redisStatus = 'connected';
  } catch {
    redisStatus = 'disconnected';
  }

  const response: HealthResponse = {
    status: redisStatus === 'connected' ? 'ok' : 'degraded',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    redis: redisStatus,
    version: process.env.npm_package_version ?? '1.0.0',
  };

  res.status(response.status === 'ok' ? 200 : 503).json(response);
});

// ── Bot routes ────────────────────────────────────────────────────────────────

app.use('/api', botRouter);

// ── 404 handler ───────────────────────────────────────────────────────────────

app.use((_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// ── Global error handler ──────────────────────────────────────────────────────

app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  logger.error('[Server] Unhandled error', { err: err.message, stack: err.stack });
  res.status(500).json({ error: 'Internal server error' });
});

// ── Boot ──────────────────────────────────────────────────────────────────────

async function main() {
  // Start BullMQ worker
  if (process.env.SKIP_WORKER !== 'true') {
    startWorker();
  }

  app.listen(PORT, () => {
    logger.info(`[Server] EchoBrief Bot Service started`, {
      port: PORT,
      env: process.env.NODE_ENV ?? 'development',
    });
  });
}

main().catch((err) => {
  logger.error('[Server] Fatal startup error', { err });
  process.exit(1);
});

export default app;
