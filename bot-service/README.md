# EchoBrief Bot Service

Headless browser bot that joins Google Meet, Zoom, and Microsoft Teams meetings to capture audio and transcribe in real-time.

## Architecture

```
POST /api/join
    │
    ▼
Orchestrator (BullMQ)
    │
    ▼
Worker picks up job
    │
    ├── Playwright browser (Chromium)
    │       └── Platform adapter (Google Meet / Zoom / Teams)
    │
    ├── AudioCapture
    │       ├── PulseAudio virtual sink
    │       └── ffmpeg → WebM file + PCM stream
    │
    └── TranscriptionService
            ├── Sarvam Saaras v3 (streaming WebSocket)
            └── Whisper fallback (batch, OpenAI API)
```

## Prerequisites

- Node.js 20+
- Redis 7+
- Docker + Docker Compose (for production)
- PulseAudio + ffmpeg (for audio capture on Linux)

## Quick Start (Docker)

```bash
# 1. Copy env file and fill in secrets
cp .env.example .env

# 2. Start services
docker-compose up --build

# 3. Bot service is live at http://localhost:3001
```

## Local Development

```bash
# Install dependencies
npm install

# Install Playwright browsers
npx playwright install chromium

# Copy and configure env
cp .env.example .env

# Start Redis (requires Docker or local Redis)
docker run -d -p 6379:6379 redis:7-alpine

# Start in dev mode (hot reload)
npm run dev
```

## Environment Variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `PORT` | No | `3001` | HTTP port |
| `REDIS_HOST` | No | `localhost` | Redis hostname |
| `REDIS_PORT` | No | `6379` | Redis port |
| `REDIS_PASSWORD` | No | — | Redis password |
| `SUPABASE_URL` | Yes | — | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | — | Supabase service role key (bypasses RLS) |
| `SARVAM_API_KEY` | No | — | Sarvam AI API key for streaming STT |
| `OPENAI_API_KEY` | No | — | OpenAI API key for Whisper fallback |
| `BOT_CONCURRENCY` | No | `5` | Max concurrent bot sessions |
| `AUDIO_OUTPUT_DIR` | No | `/tmp/echobrief-audio` | Directory for audio files |
| `CHROMIUM_PATH` | No | — | Custom Chromium binary path |
| `SKIP_WORKER` | No | `false` | Start server without BullMQ worker |
| `LOG_LEVEL` | No | `info` | Winston log level |
| `CORS_ORIGIN` | No | `*` | CORS allowed origins |

## API Reference

### POST /api/join

Start a bot session for a meeting.

**Request body:**
```json
{
  "meetingUrl": "https://meet.google.com/abc-def-ghi",
  "userId": "uuid-of-user",
  "meetingId": "uuid-of-existing-meeting (optional)",
  "displayName": "EchoBrief Notetaker",
  "preferredLanguage": "en",
  "dispatchReason": "manual"
}
```

**Response (202 Accepted):**
```json
{
  "jobId": "uuid",
  "status": "queued"
}
```

### POST /api/stop/:jobId

Stop a running bot session.

**Response:**
```json
{
  "jobId": "uuid",
  "status": "cancelled"
}
```

### GET /api/status/:jobId

Get current job status.

**Response:**
```json
{
  "jobId": "uuid",
  "status": "recording",
  "progress": 50,
  "data": { ... }
}
```

Job status values: `queued` → `joining` → `recording` → `processing` → `completed` | `failed` | `cancelled`

### GET /health

Health check.

**Response:**
```json
{
  "status": "ok",
  "timestamp": "2024-01-01T00:00:00.000Z",
  "uptime": 123.45,
  "redis": "connected",
  "version": "1.0.0"
}
```

## Supported Platforms

| Platform | URL Pattern | Notes |
|---|---|---|
| Google Meet | `meet.google.com/*` | Posts consent message in chat |
| Zoom | `zoom.us/j/*` | Forces web client via `/wc/` path |
| Microsoft Teams | `teams.microsoft.com/*` | Handles lobby waiting |

## Audio Pipeline

1. PulseAudio virtual null sink created per bot session
2. Chromium routes audio output to the sink
3. ffmpeg reads from sink monitor, outputs:
   - **WebM/Opus** file to disk (for Whisper fallback)
   - **Raw PCM** stream piped for real-time STT
4. PCM chunks forwarded to Sarvam Saaras v3 WebSocket
5. Transcript segments written to Supabase `transcript_segments` in real-time

## Database Schema

See `../supabase/migrations/v2_bot_schema.sql` for the full schema.

Key tables:
- `bot_jobs` — tracks each bot container lifecycle
- `meetings` — meeting records with `recording_source = 'bot'`
- `transcript_segments` — individual transcript segments with speaker diarization

## Production Notes

- The Docker container requires `shm_size: 2gb` for Chromium shared memory
- `SYS_ADMIN` capability is needed for PulseAudio
- Audio files are stored in `AUDIO_OUTPUT_DIR` and uploaded to Supabase Storage after the meeting ends
- Max job duration is 3 hours (configurable via `MAX_JOB_DURATION_MS` in orchestrator)
