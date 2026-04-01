import { Queue, Worker, Job, QueueEvents } from 'bullmq';
import { chromium } from 'playwright';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import { logger } from '../utils/logger';
import { detectPlatform } from '../utils/platform-detect';
import { GoogleMeetAdapter } from '../adapters/google-meet';
import { ZoomAdapter } from '../adapters/zoom';
import { TeamsAdapter } from '../adapters/teams';
import { AudioCapture } from './audio-capture';
import { TranscriptionService } from './transcription';
import {
  createBotJob,
  updateBotJob,
  createMeeting,
  updateMeetingStatus,
  uploadAudio,
  saveTranscript,
} from './supabase';
import type { BotJobData, Platform } from '../types';
import type { MeetAdapter } from '../adapters/base';

const QUEUE_NAME = 'bot-jobs';
const MAX_JOB_DURATION_MS = 3 * 60 * 60 * 1_000; // 3 hours
const CONCURRENCY = parseInt(process.env.BOT_CONCURRENCY ?? '5', 10);
const AUDIO_OUTPUT_DIR = process.env.AUDIO_OUTPUT_DIR ?? '/tmp/echobrief-audio';

const redisConnection = {
  host: process.env.REDIS_HOST ?? 'localhost',
  port: parseInt(process.env.REDIS_PORT ?? '6379', 10),
  password: process.env.REDIS_PASSWORD,
};

// Singleton queue instance
let _queue: Queue | null = null;

export function getQueue(): Queue {
  if (!_queue) {
    _queue = new Queue(QUEUE_NAME, {
      connection: redisConnection,
      defaultJobOptions: {
        attempts: 1,
        removeOnComplete: { age: 86_400 }, // Keep 24h
        removeOnFail: { age: 86_400 },
      },
    });
  }
  return _queue;
}

export function getAdapter(platform: Platform): MeetAdapter {
  switch (platform) {
    case 'google_meet':
      return new GoogleMeetAdapter();
    case 'zoom':
      return new ZoomAdapter();
    case 'teams':
      return new TeamsAdapter();
    default:
      throw new Error(`Unknown platform: ${platform}`);
  }
}

// ── Enqueue a new bot job ────────────────────────────────────────────────────

export interface EnqueueBotJobParams {
  meetingUrl: string;
  userId: string;
  meetingId?: string;
  displayName?: string;
  preferredLanguage?: string;
  dispatchReason?: string;
}

export async function enqueueBotJob(params: EnqueueBotJobParams): Promise<string> {
  const platform = detectPlatform(params.meetingUrl);
  if (!platform) {
    throw new Error(`Cannot detect platform from URL: ${params.meetingUrl}`);
  }

  const jobId = uuidv4();
  const displayName = params.displayName ?? 'EchoBrief Notetaker';
  const preferredLanguage = params.preferredLanguage ?? 'en';

  // Create record in Supabase
  await createBotJob({
    id: jobId,
    userId: params.userId,
    meetingUrl: params.meetingUrl,
    platform,
    displayName,
    preferredLanguage,
    dispatchReason: params.dispatchReason,
    meetingId: params.meetingId,
  });

  const jobData: BotJobData = {
    jobId,
    meetingUrl: params.meetingUrl,
    userId: params.userId,
    meetingId: params.meetingId,
    displayName,
    preferredLanguage,
    dispatchReason: params.dispatchReason as BotJobData['dispatchReason'],
    platform,
  };

  const queue = getQueue();
  await queue.add('join-meeting', jobData, {
    jobId,
    timeout: MAX_JOB_DURATION_MS,
  });

  logger.info('[Orchestrator] Bot job enqueued', { jobId, platform });
  return jobId;
}

// ── Worker ───────────────────────────────────────────────────────────────────

export function startWorker(): Worker {
  const worker = new Worker(
    QUEUE_NAME,
    async (job: Job<BotJobData>) => {
      const data = job.data;
      const { jobId, meetingUrl, userId, displayName, preferredLanguage, platform } = data;

      logger.info('[Worker] Processing bot job', { jobId, platform });

      await updateBotJob(jobId, {
        status: 'joining',
        startedAt: new Date().toISOString(),
      });

      const adapter = getAdapter(platform);
      const sinkName = `echobrief_${jobId.replace(/-/g, '_')}`;

      const audioCapture = new AudioCapture({
        sinkName,
        outputDir: AUDIO_OUTPUT_DIR,
        jobId,
      });

      const transcription = new TranscriptionService(preferredLanguage);

      // Wire audio chunks to transcription
      audioCapture.on('chunk', ({ data: pcm }: { data: Buffer }) => {
        transcription.sendChunk(pcm);
      });

      // Wire transcript segments to realtime Supabase saves
      let meetingId = data.meetingId ?? '';

      transcription.on('segment', async (segment) => {
        if (meetingId) {
          await saveTranscript(meetingId, [segment]).catch((err) =>
            logger.warn('[Worker] Failed to save segment', { err }),
          );
        }
      });

      const browser = await chromium.launch({
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--use-fake-ui-for-media-stream',
          '--disable-web-security',
          '--autoplay-policy=no-user-gesture-required',
        ],
        executablePath: process.env.CHROMIUM_PATH,
      });

      const context = await browser.newContext({
        permissions: ['microphone', 'camera'],
        userAgent:
          'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      });

      const page = await context.newPage();

      try {
        // Start audio capture
        await audioCapture.start();
        await transcription.connect();

        // Join the meeting
        await adapter.join(page, meetingUrl, displayName);

        await updateBotJob(jobId, { status: 'recording', joinedAt: new Date().toISOString() });

        // Create meeting record if not provided
        if (!meetingId) {
          meetingId = await createMeeting({
            userId,
            botJobId: jobId,
            platform,
            meetingUrl,
            preferredLanguage,
          });
          await updateBotJob(jobId, { meetingId });
        } else {
          await updateMeetingStatus(meetingId, 'recording');
        }

        await job.updateProgress(50);

        // Poll for meeting end
        let meetingEnded = false;
        const startTime = Date.now();

        while (!meetingEnded && Date.now() - startTime < MAX_JOB_DURATION_MS) {
          await page.waitForTimeout(10_000); // Poll every 10s
          meetingEnded = await adapter.detectMeetingEnd(page);
        }

        logger.info('[Worker] Meeting ended', { jobId });
        await adapter.leave(page);

        await updateBotJob(jobId, {
          status: 'processing',
          endedAt: new Date().toISOString(),
        });

        if (meetingId) {
          await updateMeetingStatus(meetingId, 'processing');
        }

        // Stop capture and get file path
        const audioFilePath = await audioCapture.stop();

        // Finalize transcription
        const segments = await transcription.stop(audioFilePath);

        // Save remaining segments
        if (segments.length > 0 && meetingId) {
          await saveTranscript(meetingId, segments).catch((err) =>
            logger.warn('[Worker] Failed to save final segments', { err }),
          );
        }

        // Upload audio file
        if (meetingId) {
          try {
            const { readFileSync } = await import('fs');
            const audioBuffer = readFileSync(audioFilePath);
            const audioUrl = await uploadAudio(meetingId, audioBuffer);
            await updateMeetingStatus(meetingId, 'completed', { audio_url: audioUrl });
          } catch (err) {
            logger.warn('[Worker] Failed to upload audio', { err });
          }
        }

        await updateBotJob(jobId, { status: 'completed' });
        await job.updateProgress(100);

        logger.info('[Worker] Job completed', { jobId });
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        logger.error('[Worker] Job failed', { jobId, err: errorMessage });

        await audioCapture.stop().catch(() => undefined);
        await transcription.stop().catch(() => undefined);

        await updateBotJob(jobId, {
          status: 'failed',
          errorMessage,
          endedAt: new Date().toISOString(),
        });

        if (meetingId) {
          await updateMeetingStatus(meetingId, 'failed').catch(() => undefined);
        }

        throw err;
      } finally {
        await page.close().catch(() => undefined);
        await context.close().catch(() => undefined);
        await browser.close().catch(() => undefined);
      }
    },
    {
      connection: redisConnection,
      concurrency: CONCURRENCY,
    },
  );

  worker.on('completed', (job) => {
    logger.info('[Worker] Job completed', { jobId: job.id });
  });

  worker.on('failed', (job, err) => {
    logger.error('[Worker] Job failed', { jobId: job?.id, err: err.message });
  });

  logger.info('[Orchestrator] Worker started', { concurrency: CONCURRENCY });
  return worker;
}

// ── Job control ──────────────────────────────────────────────────────────────

export async function stopJob(jobId: string): Promise<void> {
  const queue = getQueue();
  const job = await queue.getJob(jobId);
  if (!job) throw new Error(`Job ${jobId} not found`);

  await job.remove();
  await updateBotJob(jobId, {
    status: 'cancelled',
    endedAt: new Date().toISOString(),
  });
  logger.info('[Orchestrator] Job cancelled', { jobId });
}

export async function getJobStatus(jobId: string): Promise<Record<string, unknown>> {
  const queue = getQueue();
  const job = await queue.getJob(jobId);
  if (!job) {
    return { jobId, status: 'not_found' };
  }

  const state = await job.getState();
  return {
    jobId,
    status: state,
    progress: job.progress,
    data: job.data,
    failedReason: job.failedReason,
    processedOn: job.processedOn,
    finishedOn: job.finishedOn,
  };
}
