export type Platform = 'google_meet' | 'zoom' | 'teams';

export type BotJobStatus =
  | 'queued'
  | 'joining'
  | 'recording'
  | 'processing'
  | 'completed'
  | 'failed'
  | 'cancelled';

export type DispatchReason = 'calendar' | 'manual' | 'slack' | 'api' | 'extension';

export interface JoinRequest {
  meetingUrl: string;
  userId: string;
  meetingId?: string;
  displayName?: string;
  preferredLanguage?: string;
  dispatchReason?: DispatchReason;
}

export interface BotJob {
  id: string;
  userId: string;
  meetingId?: string;
  meetingUrl: string;
  platform: Platform;
  displayName: string;
  status: BotJobStatus;
  containerId?: string;
  dispatchReason?: DispatchReason;
  preferredLanguage: string;
  errorMessage?: string;
  startedAt?: string;
  joinedAt?: string;
  endedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface TranscriptSegment {
  text: string;
  speakerId?: string;
  startTime: number;
  endTime: number;
  language?: string;
  confidence?: number;
}

export interface AudioCaptureConfig {
  sinkName: string;
  outputPath: string;
  sampleRate: number;
  channels: number;
  format: string;
}

export interface BotJobData {
  jobId: string;
  meetingUrl: string;
  userId: string;
  meetingId?: string;
  displayName: string;
  preferredLanguage: string;
  dispatchReason?: DispatchReason;
  platform: Platform;
}

export interface JobStatusResponse {
  jobId: string;
  status: BotJobStatus | string;
  progress?: number;
  data?: Record<string, unknown>;
  failedReason?: string;
}

export interface HealthResponse {
  status: 'ok' | 'degraded';
  timestamp: string;
  uptime: number;
  redis: 'connected' | 'disconnected';
  version: string;
}
