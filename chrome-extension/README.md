# EchoBrief Chrome Extension

Automatically record Google Meet and Zoom Web meetings.

## Features

- 🔴 **Auto-detection**: Automatically detects when you join a meeting
- 🎙️ **Tab audio capture**: Records meeting audio (all participants)
- 📤 **Auto-upload**: Uploads recordings to EchoBrief for AI processing
- 📧 **Email summaries**: Get meeting summaries delivered to your inbox

## Installation

### For Development

1. Open Chrome and go to `chrome://extensions/`
2. Enable "Developer mode" (toggle in top-right corner)
3. Click "Load unpacked"
4. Select the `chrome-extension` folder from this project
5. The extension will appear in your extensions bar

### Creating Icons

Before loading the extension, create placeholder icons:

1. Create an `icons` folder inside `chrome-extension`
2. Add icon files:
   - `icon16.png` (16x16 pixels)
   - `icon48.png` (48x48 pixels)
   - `icon128.png` (128x128 pixels)

You can use any image editor or online tool to create these.

## Usage

1. **Log in**: Click the extension icon and log in to EchoBrief
2. **Join a meeting**: Go to Google Meet or Zoom Web
3. **Recording starts automatically**: You'll see a notification banner and status indicator
4. **Meeting ends**: Recording is uploaded and processed
5. **Get summary**: AI-generated summary is emailed to you

## Supported Platforms

- ✅ Google Meet (meet.google.com)
- ✅ Zoom Web (zoom.us/wc/*)
- ❌ Zoom Desktop App (requires native app)
- ❌ Microsoft Teams (coming soon)

## How It Works

1. **Content Script** (`content.js`): Injected into meeting pages to show recording status
2. **Background Service Worker** (`background.js`): Handles tab audio capture and upload
3. **Popup** (`popup.html/js`): Shows status and controls

## Permissions

- `activeTab`: Access the current tab
- `tabCapture`: Capture tab audio
- `storage`: Save auth token
- `tabs`: Detect meeting URLs
- `scripting`: Inject content scripts

## Troubleshooting

### Recording not starting

- Make sure you're logged in to EchoBrief (click extension icon)
- Check that the extension has permission for the meeting site
- Reload the meeting page

### No audio captured

- Tab capture requires the tab to be focused when recording starts
- Some meetings may have audio restrictions

### Upload failed

- Check your internet connection
- Make sure you're still logged in to EchoBrief
