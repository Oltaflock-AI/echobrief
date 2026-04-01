import WebSocket from 'ws';
import { EventEmitter } from 'events';
import fs from 'fs';
import { logger } from '../utils/logger';
import type { TranscriptSegment } from '../types';

// ── Sarvam Saaras v3 streaming WebSocket ─────────────────────────────────────

interface SarvamTranscriptEvent {
  transcript?: string;
  speaker_id?: string;
  start_time?: number;
  end_time?: number;
  is_final?: boolean;
  language?: string;
  confidence?: number;
}

export class TranscriptionService extends EventEmitter {
  private ws: WebSocket | null = null;
  private connected = false;
  private language: string;
  private segments: TranscriptSegment[] = [];
  private audioBuffer: Buffer[] = [];
  private useWhisperFallback = false;

  constructor(language = 'en') {
    super();
    this.language = language;
  }

  /**
   * Connect to Sarvam Saaras v3 streaming WebSocket.
   * Falls back to Whisper batch mode if API key not set or connection fails.
   */
  async connect(): Promise<void> {
    const apiKey = process.env.SARVAM_API_KEY;
    if (!apiKey) {
      logger.warn('[Transcription] SARVAM_API_KEY not set — will use Whisper batch fallback');
      this.useWhisperFallback = true;
      return;
    }

    const wsUrl = `wss://api.sarvam.ai/speech-to-text-translate/streaming?api_key=${apiKey}&language_code=${this.language}&model=saaras:v3`;

    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(wsUrl);

      this.ws.on('open', () => {
        this.connected = true;
        logger.info('[Transcription] Sarvam streaming connected');
        resolve();
      });

      this.ws.on('message', (raw: Buffer) => {
        try {
          const event: SarvamTranscriptEvent = JSON.parse(raw.toString());
          if (event.transcript && event.is_final) {
            const segment: TranscriptSegment = {
              text: event.transcript,
              speakerId: event.speaker_id,
              startTime: event.start_time ?? 0,
              endTime: event.end_time ?? 0,
              language: event.language ?? this.language,
              confidence: event.confidence,
            };
            this.segments.push(segment);
            this.emit('segment', segment);
          }
        } catch (err) {
          logger.warn('[Transcription] Failed to parse Sarvam event', { err });
        }
      });

      this.ws.on('error', (err) => {
        logger.error('[Transcription] Sarvam WS error — switching to Whisper fallback', { err });
        this.useWhisperFallback = true;
        this.ws = null;
        this.connected = false;
        resolve(); // Don't reject — fall back gracefully
      });

      this.ws.on('close', () => {
        this.connected = false;
        logger.info('[Transcription] Sarvam WS closed');
      });

      // Timeout after 10s if no connection
      setTimeout(() => {
        if (!this.connected) {
          logger.warn('[Transcription] Sarvam WS connect timeout — switching to Whisper fallback');
          this.useWhisperFallback = true;
          this.ws?.terminate();
          this.ws = null;
          resolve();
        }
      }, 10_000);
    });
  }

  /**
   * Send a PCM audio chunk for streaming transcription.
   * If using fallback mode, the chunk is buffered for batch processing.
   */
  sendChunk(pcmBuffer: Buffer): void {
    if (this.useWhisperFallback) {
      this.audioBuffer.push(pcmBuffer);
      return;
    }

    if (this.ws && this.connected) {
      try {
        this.ws.send(pcmBuffer);
      } catch (err) {
        logger.warn('[Transcription] Failed to send chunk to Sarvam', { err });
        this.audioBuffer.push(pcmBuffer); // Buffer for fallback
        this.useWhisperFallback = true;
      }
    }
  }

  /**
   * Close WebSocket and run Whisper batch if in fallback mode.
   * Returns all transcript segments.
   */
  async stop(audioFilePath?: string): Promise<TranscriptSegment[]> {
    if (this.ws && this.connected) {
      this.ws.close();
      await new Promise<void>((resolve) => setTimeout(resolve, 1_000));
    }

    if (this.useWhisperFallback && audioFilePath) {
      logger.info('[Transcription] Running Whisper batch fallback', { audioFilePath });
      const whisperSegments = await this._runWhisperBatch(audioFilePath);
      this.segments.push(...whisperSegments);
    }

    logger.info('[Transcription] Done', { segmentCount: this.segments.length });
    return this.segments;
  }

  getSegments(): TranscriptSegment[] {
    return [...this.segments];
  }

  // ── Whisper fallback ──────────────────────────────────────────────────────

  private async _runWhisperBatch(audioFilePath: string): Promise<TranscriptSegment[]> {
    const openaiKey = process.env.OPENAI_API_KEY;
    if (!openaiKey) {
      logger.warn('[Transcription] OPENAI_API_KEY not set — cannot run Whisper fallback');
      return [];
    }

    if (!fs.existsSync(audioFilePath)) {
      logger.warn('[Transcription] Audio file not found for Whisper', { audioFilePath });
      return [];
    }

    try {
      // Use FormData to upload to OpenAI Whisper API
      const FormData = (await import('form-data')).default;
      const form = new FormData();
      form.append('file', fs.createReadStream(audioFilePath), {
        filename: 'audio.webm',
        contentType: 'audio/webm',
      });
      form.append('model', 'whisper-1');
      form.append('language', this.language === 'auto' ? '' : this.language);
      form.append('response_format', 'verbose_json');
      form.append('timestamp_granularities[]', 'segment');

      const fetch = (await import('node-fetch')).default;
      const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${openaiKey}`,
          ...form.getHeaders(),
        },
        body: form,
      });

      if (!response.ok) {
        const errText = await response.text();
        logger.error('[Transcription] Whisper API error', { status: response.status, errText });
        return [];
      }

      const result = (await response.json()) as {
        segments?: Array<{
          text: string;
          start: number;
          end: number;
          avg_logprob?: number;
        }>;
      };

      return (result.segments ?? []).map((seg) => ({
        text: seg.text.trim(),
        startTime: seg.start,
        endTime: seg.end,
        language: this.language,
        confidence: seg.avg_logprob ? Math.exp(seg.avg_logprob) : undefined,
      }));
    } catch (err) {
      logger.error('[Transcription] Whisper batch failed', { err });
      return [];
    }
  }
}
