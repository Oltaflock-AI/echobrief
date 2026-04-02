#!/bin/bash

# Test Recall webhook integration locally
# Usage: bash test-recall-integration.sh <meeting_id> <bot_id>

MEETING_ID=${1:-"test-meeting-$(date +%s)"}
BOT_ID=${2:-"test-bot-$(date +%s)"}
SUPABASE_URL="https://lekkpfpojlspbuwrtmzt.supabase.co"
WEBHOOK_URL="$SUPABASE_URL/functions/v1/recall-webhook"

echo "Testing Recall webhook integration..."
echo "Meeting ID: $MEETING_ID"
echo "Bot ID: $BOT_ID"
echo "Webhook URL: $WEBHOOK_URL"

# First, create a test bot_job in Supabase (requires API key)
echo ""
echo "Step 1: Create test bot_job..."
# Skip for now - this would need direct DB access

# Simulate Recall webhook payload
PAYLOAD=$(cat <<EOF
{
  "event": "bot.status_change",
  "status": "done",
  "bot_id": "$BOT_ID",
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
}
EOF
)

echo ""
echo "Step 2: Send webhook payload..."
echo "Payload:"
echo "$PAYLOAD" | jq .

# Send to webhook
RESPONSE=$(curl -s -X POST \
  -H "Content-Type: application/json" \
  -d "$PAYLOAD" \
  "$WEBHOOK_URL")

echo ""
echo "Response:"
echo "$RESPONSE" | jq . || echo "$RESPONSE"

echo ""
echo "Test completed."
