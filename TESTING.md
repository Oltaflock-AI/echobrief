# EchoBrief End-to-End Testing Guide

## Prerequisites
- Supabase account and project `lekkpfpojlspbuwrtmzt`
- Recall.ai bot deployed and running
- OpenAI API key configured in Vercel env vars
- Local dev environment with `npm install` completed

## Test Flow

### Phase 1: Recall Bot Integration (Manual)
1. **Manually start a Recall bot** on a real Zoom/Teams/Google Meet meeting
2. Wait for the meeting to end
3. Recall will POST to our webhook: `https://echobrief-ten.vercel.app/api/functions/v1/recall-webhook`
4. Check Supabase `transcripts` table — transcript should be stored

### Phase 2: Webhook Verification
- **Endpoint:** `POST https://lekkpfpojlspbuwrtmzt.supabase.co/functions/v1/recall-webhook`
- **Payload:**
```json
{
  "event": "bot.status_change",
  "status": "done",
  "bot_id": "<RECALL_BOT_ID>",
  "timestamp": "2026-04-02T10:30:00Z"
}
```
- **Expected response:**
```json
{
  "success": true,
  "meeting_id": "<uuid>"
}
```

### Phase 3: Insight Generation
- After webhook completes, check `meeting_insights` table
- Insights should include: summary_short, summary_detailed, key_points, decisions, action_items, risks, open_questions, strategic_insights

### Phase 4: Dashboard Display
1. Visit `https://echobrief-ten.vercel.app/dashboard`
2. Click on a meeting (status should be "completed" if insights were generated)
3. View the Summary tab — should display:
   - Executive Summary
   - Key Decisions
   - Strategic Insights
   - Key Points
   - Risks (if any)
   - Open Questions
   - Follow-Ups
   - Speakers

### Phase 5: WhatsApp Delivery (Future)
- Currently stub implementation
- Needs Twilio/GupShup integration
- Will send structured meeting report via WhatsApp

## Debugging

### Check if webhook received:
```bash
# Check function logs in Supabase dashboard
# Functions > recall-webhook > Logs tab
```

### Check if insights generated:
```bash
# In Supabase dashboard
# SQL Editor > SELECT * FROM meeting_insights WHERE meeting_id = '<id>';
```

### Check MeetingDetail rendering:
- Open browser DevTools > Network tab
- Look for `/api/functions/v1/generate-meeting-insights` request
- Should return 200 with insights JSON

### Common Issues

**1. Transcript not appearing**
- Verify Recall API key is set in Vercel env vars
- Check that bot_job exists in DB with correct meeting_id
- Inspect webhook logs for RECALL_API_KEY error

**2. Insights not generating**
- Verify OpenAI API key in Vercel env vars
- Check edge function logs for model errors
- Fall back to Anthropic API if OpenAI fails (already implemented)

**3. Dashboard not showing insights**
- Verify meeting status is "completed" in DB
- Check if `meeting_insights` record exists
- Inspect MeetingDetail component for fetch errors in DevTools

## Performance Notes
- Insight generation may take 10-30 seconds depending on transcript length and API latency
- Consider showing a "Processing insights..." loader while waiting
- Currently implemented as fire-and-forget async task

## Next Steps
1. Deploy edge functions to Supabase (via GitHub Actions or manual `supabase functions deploy`)
2. Test with real Recall bot integration
3. Build WhatsApp delivery integration
4. Add loading states to UI
5. Implement result caching for faster dashboard loads
