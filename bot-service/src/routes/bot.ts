import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { enqueueBotJob, stopJob, getJobStatus } from '../services/orchestrator';
import { isValidMeetingUrl } from '../utils/platform-detect';
import { logger } from '../utils/logger';

const router = Router();

// ── Validation schemas ────────────────────────────────────────────────────────

const JoinSchema = z.object({
  meetingUrl: z.string().url('Invalid URL'),
  userId: z.string().uuid('userId must be a UUID'),
  meetingId: z.string().uuid().optional(),
  displayName: z.string().min(1).max(60).optional(),
  preferredLanguage: z.string().min(2).max(10).optional(),
  dispatchReason: z
    .enum(['calendar', 'manual', 'slack', 'api', 'extension'])
    .optional(),
});

// ── POST /join ────────────────────────────────────────────────────────────────

router.post('/join', async (req: Request, res: Response) => {
  const parsed = JoinSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Validation failed', details: parsed.error.issues });
  }

  const { meetingUrl, userId, meetingId, displayName, preferredLanguage, dispatchReason } =
    parsed.data;

  if (!isValidMeetingUrl(meetingUrl)) {
    return res.status(400).json({
      error: 'Unsupported meeting platform. Supported: Google Meet, Zoom, Microsoft Teams.',
    });
  }

  try {
    const jobId = await enqueueBotJob({
      meetingUrl,
      userId,
      meetingId,
      displayName,
      preferredLanguage,
      dispatchReason,
    });

    logger.info('[Routes] Bot job enqueued', { jobId, userId });
    return res.status(202).json({ jobId, status: 'queued' });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal error';
    logger.error('[Routes] Failed to enqueue bot job', { err: message });
    return res.status(500).json({ error: message });
  }
});

// ── POST /stop/:jobId ─────────────────────────────────────────────────────────

router.post('/stop/:jobId', async (req: Request, res: Response) => {
  const { jobId } = req.params;
  try {
    await stopJob(jobId);
    return res.json({ jobId, status: 'cancelled' });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal error';
    if (message.includes('not found')) {
      return res.status(404).json({ error: `Job ${jobId} not found` });
    }
    logger.error('[Routes] Failed to stop job', { jobId, err: message });
    return res.status(500).json({ error: message });
  }
});

// ── GET /status/:jobId ────────────────────────────────────────────────────────

router.get('/status/:jobId', async (req: Request, res: Response) => {
  const { jobId } = req.params;
  try {
    const status = await getJobStatus(jobId);
    return res.json(status);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal error';
    logger.error('[Routes] Failed to get job status', { jobId, err: message });
    return res.status(500).json({ error: message });
  }
});

export default router;
