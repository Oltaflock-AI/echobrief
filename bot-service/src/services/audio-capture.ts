import { spawn, ChildProcess } from 'child_process';
import { EventEmitter } from 'events';
import path from 'path';
import fs from 'fs';
import { logger } from '../utils/logger';

export interface AudioCaptureOptions {
  sinkName: string;
  outputDir: string;
  jobId: string;
  sampleRate?: number;
  channels?: number;
}

export interface AudioChunk {
  data: Buffer;
  timestamp: number;
}

/**
 * AudioCapture wraps PulseAudio virtual sink + ffmpeg to:
 *  - Create a virtual null sink in PulseAudio
 *  - Record from that sink via ffmpeg
 *  - Emit 'chunk' events with raw audio buffers for streaming STT
 *  - Write a WebM file to disk for batch fallback
 */
export class AudioCapture extends EventEmitter {
  private sinkModule: number | null = null;
  private ffmpegProc: ChildProcess | null = null;
  private outputPath: string;
  private sinkName: string;
  private running = false;

  constructor(private readonly options: AudioCaptureOptions) {
    super();
    this.sinkName = options.sinkName;
    this.outputPath = path.join(options.outputDir, `${options.jobId}.webm`);

    // Ensure output dir exists
    fs.mkdirSync(options.outputDir, { recursive: true });
  }

  get audioFilePath(): string {
    return this.outputPath;
  }

  /**
   * Set up PulseAudio virtual sink and start ffmpeg recording.
   * Resolves once the sink is ready and ffmpeg is running.
   */
  async start(): Promise<void> {
    if (this.running) return;
    this.sinkModule = await this._loadPulseSink();
    this.ffmpegProc = this._startFfmpeg();
    this.running = true;
    logger.info('[AudioCapture] Started', { sink: this.sinkName, output: this.outputPath });
  }

  /**
   * Stop ffmpeg and unload the PulseAudio sink.
   * Returns the path to the recorded WebM file.
   */
  async stop(): Promise<string> {
    if (!this.running) return this.outputPath;
    this.running = false;

    // Gracefully stop ffmpeg
    if (this.ffmpegProc) {
      this.ffmpegProc.stdin?.write('q');
      await new Promise<void>((resolve) => {
        this.ffmpegProc!.once('exit', () => resolve());
        setTimeout(resolve, 5_000); // Force after 5s
      });
      this.ffmpegProc = null;
    }

    // Unload PulseAudio sink
    if (this.sinkModule !== null) {
      await this._unloadPulseSink(this.sinkModule);
      this.sinkModule = null;
    }

    logger.info('[AudioCapture] Stopped', { output: this.outputPath });
    return this.outputPath;
  }

  /**
   * Returns the PULSE_SINK env var value to pass to Playwright/Chromium
   * so the browser routes audio into our virtual sink.
   */
  getPulseSinkEnv(): Record<string, string> {
    return {
      PULSE_SINK: this.sinkName,
      PULSE_SOURCE: `${this.sinkName}.monitor`,
    };
  }

  // ── Private helpers ─────────────────────────────────────────────────────

  private _loadPulseSink(): Promise<number> {
    return new Promise((resolve, reject) => {
      const proc = spawn('pactl', [
        'load-module',
        'module-null-sink',
        `sink_name=${this.sinkName}`,
        `sink_properties=device.description="${this.sinkName}"`,
      ]);

      let stdout = '';
      proc.stdout.on('data', (d: Buffer) => (stdout += d.toString()));
      proc.on('close', (code) => {
        if (code !== 0) {
          // Might not have PulseAudio in dev — log warning and continue
          logger.warn('[AudioCapture] pactl load-module failed (no PulseAudio?)', { code });
          resolve(0);
        } else {
          const moduleId = parseInt(stdout.trim(), 10);
          logger.debug('[AudioCapture] Loaded PulseAudio sink', { moduleId, sink: this.sinkName });
          resolve(moduleId);
        }
      });
      proc.on('error', (err) => {
        logger.warn('[AudioCapture] pactl not available', { err: err.message });
        resolve(0); // Non-fatal in dev
      });
    });
  }

  private _unloadPulseSink(moduleId: number): Promise<void> {
    if (moduleId === 0) return Promise.resolve();
    return new Promise((resolve) => {
      const proc = spawn('pactl', ['unload-module', String(moduleId)]);
      proc.on('close', () => resolve());
      proc.on('error', () => resolve());
    });
  }

  private _startFfmpeg(): ChildProcess {
    const sampleRate = this.options.sampleRate ?? 16_000;
    const channels = this.options.channels ?? 1;

    const args = [
      '-f', 'pulse',
      '-i', `${this.sinkName}.monitor`,
      '-ar', String(sampleRate),
      '-ac', String(channels),
      // Write WebM/Opus to disk
      '-c:a', 'libopus',
      '-b:a', '32k',
      this.outputPath,
      // Also pipe raw PCM to stdout for streaming STT
      '-f', 's16le',
      '-ar', String(sampleRate),
      '-ac', String(channels),
      'pipe:1',
    ];

    const ffmpeg = spawn('ffmpeg', args, { stdio: ['pipe', 'pipe', 'pipe'] });

    ffmpeg.stdout.on('data', (chunk: Buffer) => {
      if (this.running) {
        this.emit('chunk', { data: chunk, timestamp: Date.now() } as AudioChunk);
      }
    });

    ffmpeg.stderr.on('data', (d: Buffer) => {
      const msg = d.toString();
      // Only log errors not routine progress messages
      if (msg.includes('Error') || msg.includes('error')) {
        logger.warn('[AudioCapture] ffmpeg stderr', { msg: msg.trim() });
      }
    });

    ffmpeg.on('exit', (code, signal) => {
      if (this.running) {
        logger.error('[AudioCapture] ffmpeg exited unexpectedly', { code, signal });
        this.emit('error', new Error(`ffmpeg exited with code ${code}`));
      }
    });

    ffmpeg.on('error', (err) => {
      logger.warn('[AudioCapture] ffmpeg not available', { err: err.message });
      this.emit('error', err);
    });

    return ffmpeg;
  }
}
