import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { logger } from '../utils/logger';
import type { BotJobStatus, Platform, TranscriptSegment } from '../types';

let _client: SupabaseClient | null = null;

function getClient(): SupabaseClient {
  if (_client) return _client;

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required');
  }

  _client = createClient(url, key, {
    auth: { persistSession: false },
  });

  return _client;
}

// ── Bot Jobs ─────────────────────────────────────────────────────────────────

export interface CreateBotJobParams {
  id: string;
  userId: string;
  meetingUrl: string;
  platform: Platform;
  displayName: string;
  preferredLanguage: string;
  dispatchReason?: string;
  meetingId?: string;
}

export async function createBotJob(params: CreateBotJobParams): Promise<void> {
  const sb = getClient();
  const { error } = await sb.from('bot_jobs').insert({
    id: params.id,
    user_id: params.userId,
    meeting_url: params.meetingUrl,
    platform: params.platform,
    display_name: params.displayName,
    preferred_language: params.preferredLanguage,
    dispatch_reason: params.dispatchReason,
    meeting_id: params.meetingId ?? null,
    status: 'queued',
  });

  if (error) {
    logger.error('[Supabase] Failed to create bot job', { error, id: params.id });
    throw error;
  }
  logger.info('[Supabase] Bot job created', { id: params.id });
}

export interface UpdateBotJobParams {
  status?: BotJobStatus;
  containerId?: string;
  errorMessage?: string;
  startedAt?: string;
  joinedAt?: string;
  endedAt?: string;
  meetingId?: string;
}

export async function updateBotJob(id: string, params: UpdateBotJobParams): Promise<void> {
  const sb = getClient();
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if (params.status !== undefined) update.status = params.status;
  if (params.containerId !== undefined) update.container_id = params.containerId;
  if (params.errorMessage !== undefined) update.error_message = params.errorMessage;
  if (params.startedAt !== undefined) update.started_at = params.startedAt;
  if (params.joinedAt !== undefined) update.joined_at = params.joinedAt;
  if (params.endedAt !== undefined) update.ended_at = params.endedAt;
  if (params.meetingId !== undefined) update.meeting_id = params.meetingId;

  const { error } = await sb.from('bot_jobs').update(update).eq('id', id);
  if (error) {
    logger.error('[Supabase] Failed to update bot job', { error, id });
    throw error;
  }
}

// ── Meetings ─────────────────────────────────────────────────────────────────

export interface CreateMeetingParams {
  userId: string;
  botJobId: string;
  platform: Platform;
  meetingUrl: string;
  preferredLanguage: string;
  title?: string;
}

export async function createMeeting(params: CreateMeetingParams): Promise<string> {
  const sb = getClient();
  const { data, error } = await sb
    .from('meetings')
    .insert({
      user_id: params.userId,
      bot_job_id: params.botJobId,
      platform: params.platform,
      meeting_url: params.meetingUrl,
      preferred_language: params.preferredLanguage,
      recording_source: 'bot',
      title: params.title ?? 'Untitled Meeting',
      status: 'recording',
    })
    .select('id')
    .single();

  if (error) {
    logger.error('[Supabase] Failed to create meeting', { error });
    throw error;
  }

  return (data as { id: string }).id;
}

export async function updateMeetingStatus(
  meetingId: string,
  status: string,
  extra?: Record<string, unknown>,
): Promise<void> {
  const sb = getClient();
  const { error } = await sb
    .from('meetings')
    .update({ status, updated_at: new Date().toISOString(), ...(extra ?? {}) })
    .eq('id', meetingId);

  if (error) {
    logger.error('[Supabase] Failed to update meeting status', { error, meetingId });
    throw error;
  }
}

// ── Audio upload ──────────────────────────────────────────────────────────────

export async function uploadAudio(
  meetingId: string,
  audioBuffer: Buffer,
  mimeType = 'audio/webm',
): Promise<string> {
  const sb = getClient();
  const path = `meetings/${meetingId}/audio.webm`;

  const { error } = await sb.storage.from('recordings').upload(path, audioBuffer, {
    contentType: mimeType,
    upsert: true,
  });

  if (error) {
    logger.error('[Supabase] Failed to upload audio', { error, meetingId });
    throw error;
  }

  const { data } = sb.storage.from('recordings').getPublicUrl(path);
  logger.info('[Supabase] Audio uploaded', { meetingId, url: data.publicUrl });
  return data.publicUrl;
}

// ── Transcript segments ───────────────────────────────────────────────────────

export async function saveTranscript(
  meetingId: string,
  segments: TranscriptSegment[],
): Promise<void> {
  const sb = getClient();

  const rows = segments.map((seg) => ({
    meeting_id: meetingId,
    text: seg.text,
    speaker_id: seg.speakerId ?? null,
    start_time: seg.startTime,
    end_time: seg.endTime,
    language: seg.language ?? 'en',
    confidence: seg.confidence ?? null,
  }));

  const { error } = await sb.from('transcript_segments').insert(rows);
  if (error) {
    logger.error('[Supabase] Failed to save transcript segments', { error, meetingId });
    throw error;
  }
  logger.debug('[Supabase] Transcript segments saved', { meetingId, count: rows.length });
}
