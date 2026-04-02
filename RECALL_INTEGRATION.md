# Recall API Integration - EchoBrief

## Credentials
- **Recall API Key**: 6d5b5f5bf401869ffc061797ba5cd9f2e2f7f020
- **Sarvam API Key**: sk_g9gcx19q_F3701xwAFplbozPOu6wayNYF

## Architecture

### 1. Meeting Detection
- Calendar sync detects Teams/Zoom/Google Meet URLs
- Extract meeting link from calendar event
- Check user's auto-join preference

### 2. Bot Join (Recall API)
- Call `POST /api/v2/recordingbots`
- Pass meeting URL + Recall config
- Recall creates headless browser instance
- Bot joins meeting + starts recording

### 3. Real-time Transcription (Sarvam)
- Recall captures audio stream
- Send to Sarvam Saaras v3 for STT
- Supports: Hindi, English, Tamil, Telugu, Marathi, Kannada, Bengali
- Real-time transcription as meeting progresses

### 4. AI Processing (GPT-4o-mini)
- When recording ends, get full transcript from Recall
- Send to GPT-4o-mini for:
  - Action items extraction
  - Key insights
  - Summary generation
  - Sentiment analysis (optional)

### 5. Storage & Delivery
- Store in Supabase `meetings` table:
  - meeting_id (from Recall)
  - transcript (from Sarvam)
  - summary (from GPT)
  - action_items
  - recording_url (from Recall)
  - status (completed/processing/failed)

- Deliver via:
  - Dashboard (Meetings tab)
  - Email
  - Slack (if connected)
  - WhatsApp (if connected)

## API Endpoints Needed

### Recall Webhook Handler
- `POST /api/webhooks/recall`
- Receives recording completion event
- Triggers transcript fetch + AI processing

### Calendar Auto-join Job
- Runs every 5-10 minutes
- Checks upcoming meetings
- If auto-join enabled → call Recall API

### Manual Record Trigger
- `POST /api/meetings/record`
- User clicks "Record Now" on Calendar
- Immediately joins meeting with Recall

## Implementation Order
1. Store API keys securely (environment variables)
2. Create Recall service client
3. Add auto-join toggle to Settings page
4. Build calendar meeting detector
5. Create webhook handler
6. Integrate Sarvam for transcription
7. Add manual "Record Now" button
8. Update Meetings tab to show Recall recordings
9. Test end-to-end with test meeting

## Testing
- Create test Teams/Zoom meeting
- Toggle auto-join in Settings
- Calendar should auto-trigger Recall join
- Verify recording completes
- Verify transcript + summary stored
- Verify Meetings tab shows recording
