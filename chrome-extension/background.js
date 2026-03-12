// EchoBrief Background Service Worker
// Uses getMediaStreamId + offscreen document for tab capture (MV3 compatible)
// State is persisted to chrome.storage.local to survive service worker restarts

const ECHOBRIEF_API_URL = 'https://qjhysesjocanowmdkeme.supabase.co/functions/v1';
const MEETING_URL_PATTERNS = [
  /^https:\/\/meet\.google\.com\/.+/,
  /^https:\/\/.*\.zoom\.us\/wc\/.+/,
  /^https:\/\/.*\.zoom\.us\/j\/.+/
];

const KEEPALIVE_ALARM = 'echobrief-keepalive';
const STOP_TIMEOUT_ALARM = 'echobrief-stop-timeout';

let recordingState = {
  isRecording: false,
  tabId: null,
  meetingId: null,
  startTime: null,
  meetingTitle: '',
  meetingUrl: ''
};

// --- State Persistence ---

async function saveState() {
  try {
    await chrome.storage.local.set({ _recordingState: recordingState });
  } catch (e) {
    console.error('Failed to save recording state:', e);
  }
}

async function restoreState() {
  try {
    const { _recordingState } = await chrome.storage.local.get('_recordingState');
    if (_recordingState && _recordingState.isRecording) {
      const hasOffscreen = await chrome.offscreen.hasDocument();
      if (hasOffscreen) {
        recordingState = _recordingState;
        startKeepalive();
      } else {
        // Offscreen doc is gone; recording is dead, clean up stale state
        await chrome.storage.local.remove('_recordingState');
      }
    } else if (_recordingState && _recordingState.tabId) {
      // Stopped but waiting for upload completion; restore so we can relay the result
      recordingState = _recordingState;
    }
  } catch (e) {
    console.error('Failed to restore recording state:', e);
  }
}

const stateReady = restoreState();

// --- Keepalive ---

function startKeepalive() {
  chrome.alarms.create(KEEPALIVE_ALARM, { periodInMinutes: 0.5 });
}

function stopKeepalive() {
  chrome.alarms.clear(KEEPALIVE_ALARM);
}

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === KEEPALIVE_ALARM) {
    await stateReady;
    if (!recordingState.isRecording) {
      stopKeepalive();
    }
  }
  if (alarm.name === STOP_TIMEOUT_ALARM) {
    // Offscreen didn't respond after stop; force cleanup
    await stateReady;
    if (recordingState.tabId) {
      console.warn('Stop timeout: forcing state reset');
      stopKeepalive();
      resetState();
      chrome.offscreen.hasDocument().then((has) => {
        if (has) chrome.offscreen.closeDocument();
      }).catch(() => {});
    }
  }
});

// --- Utility ---

function isMeetingUrl(url) {
  return MEETING_URL_PATTERNS.some((p) => p.test(url));
}

function getMeetingTitle(url) {
  try {
    const u = new URL(url);
    if (u.hostname === 'meet.google.com') return `Google Meet - ${u.pathname.slice(1)}`;
    if (u.hostname.includes('zoom.us')) return `Zoom Meeting - ${u.pathname.split('/').pop()}`;
  } catch (e) {}
  return 'Meeting Recording';
}

// --- Tab Listeners ---

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  await stateReady;
  if (changeInfo.status === 'complete' && tab?.url && isMeetingUrl(tab.url) && !recordingState.isRecording) {
    chrome.tabs.sendMessage(tabId, {
      type: 'MEETING_DETECTED',
      url: tab.url,
      title: getMeetingTitle(tab.url)
    }).catch(() => {});
  }
});

chrome.tabs.onRemoved.addListener(async (tabId) => {
  await stateReady;
  if (recordingState.tabId === tabId && recordingState.isRecording) {
    stopRecording();
  }
});

// --- Message Handler ---

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  handleMessage(message, sender, sendResponse);
  return true;
});

async function handleMessage(message, sender, sendResponse) {
  await stateReady;

  switch (message.type) {
    case 'GET_RECORDING_STATUS':
      sendResponse({
        isRecording: recordingState.isRecording,
        meetingTitle: recordingState.meetingTitle,
        duration: recordingState.startTime
          ? Math.floor((Date.now() - recordingState.startTime) / 1000)
          : 0
      });
      break;

    case 'START_RECORDING':
      if (sender.tab) {
        try {
          const result = await startRecordingFromTab(sender.tab.id, sender.tab.url);
          sendResponse(result);
        } catch (err) {
          sendResponse({ error: err.message });
        }
      }
      break;

    case 'START_RECORDING_WITH_STREAM_ID':
      try {
        await startRecordingWithStreamId(message);
        sendResponse({ success: true });
      } catch (err) {
        sendResponse({ error: err.message });
      }
      break;

    case 'STOP_RECORDING':
      stopRecording();
      sendResponse({ success: true });
      break;

    case 'SET_AUTH_TOKEN':
      chrome.storage.local.set({ authToken: message.token });
      sendResponse({ success: true });
      break;

    case 'RECORDING_COMPLETED':
    case 'RECORDING_FAILED': {
      chrome.alarms.clear(STOP_TIMEOUT_ALARM);
      const tabId = recordingState.tabId;
      stopKeepalive();
      resetState();
      if (tabId) {
        chrome.tabs.sendMessage(tabId, {
          type: message.type === 'RECORDING_COMPLETED' ? 'RECORDING_UPLOADED' : 'RECORDING_ERROR',
          error: message.type === 'RECORDING_FAILED' ? 'Recording failed' : undefined,
          meetingId: message.meetingId
        }).catch(() => {});
      }
      break;
    }

    case 'MIC_PERMISSION_FAILED':
      chrome.storage.local.set({ micPermissionGranted: false });
      if (recordingState.tabId) {
        chrome.tabs.sendMessage(recordingState.tabId, {
          type: 'MIC_UNAVAILABLE',
          error: message.error
        }).catch(() => {});
      }
      break;

    case 'OFFSCREEN_HEARTBEAT':
      break;

    case 'CLOSE_OFFSCREEN':
      chrome.offscreen.hasDocument().then((has) => {
        if (has) chrome.offscreen.closeDocument();
      }).catch(() => {});
      break;
  }
}

// --- Recording Functions ---

async function startRecordingFromTab(tabId, url) {
  if (recordingState.isRecording) return { error: 'Already recording' };
  if (!isMeetingUrl(url)) return { error: 'Not a meeting page' };

  const { authToken } = await chrome.storage.local.get('authToken');
  if (!authToken) return { error: 'Please log in to EchoBrief first' };

  let streamId;
  try {
    streamId = await chrome.tabCapture.getMediaStreamId({ targetTabId: tabId });
  } catch (err) {
    return { error: err.message || 'Tab capture not available. Make sure the meeting tab is active.' };
  }

  await startRecordingWithStreamId({ streamId, tabId, url });
  return { success: true };
}

async function startRecordingWithStreamId({ streamId, tabId, url }) {
  if (recordingState.isRecording) {
    // Check if offscreen document is actually alive; if not, recover
    const hasOffscreen = await chrome.offscreen.hasDocument();
    if (!hasOffscreen) {
      stopKeepalive();
      resetState();
    } else {
      return;
    }
  }

  const meetingTitle = getMeetingTitle(url);
  recordingState = {
    isRecording: true,
    tabId,
    meetingId: null,
    startTime: Date.now(),
    meetingTitle,
    meetingUrl: url
  };

  await saveState();
  startKeepalive();

  const hasOffscreen = await chrome.offscreen.hasDocument();
  if (!hasOffscreen) {
    await chrome.offscreen.createDocument({
      url: 'offscreen.html',
      reasons: ['USER_MEDIA'],
      justification: 'Recording meeting audio via tabCapture'
    });
  }

  const { authToken } = await chrome.storage.local.get('authToken');

  chrome.runtime.sendMessage({
    target: 'offscreen',
    type: 'start-recording',
    data: { streamId, meetingTitle, meetingUrl: url, authToken }
  }).catch((err) => {
    console.error('Failed to start offscreen recording:', err);
    stopKeepalive();
    resetState();
    if (tabId) chrome.tabs.sendMessage(tabId, { type: 'RECORDING_ERROR', error: err.message }).catch(() => {});
  });

  chrome.tabs.sendMessage(tabId, { type: 'RECORDING_STARTED', title: meetingTitle }).catch(() => {});
}

function stopRecording() {
  if (!recordingState.isRecording) return;

  recordingState.isRecording = false;
  saveState();

  const tabId = recordingState.tabId;

  chrome.runtime.sendMessage({ target: 'offscreen', type: 'stop-recording' }).catch(() => {
    // Offscreen document is already gone; force cleanup
    stopKeepalive();
    resetState();
    chrome.alarms.clear(STOP_TIMEOUT_ALARM);
  });

  if (tabId) {
    chrome.tabs.sendMessage(tabId, { type: 'RECORDING_STOPPED' }).catch(() => {});
  }

  // Safety: if offscreen doesn't send RECORDING_COMPLETED within 30s, force reset
  chrome.alarms.create(STOP_TIMEOUT_ALARM, { delayInMinutes: 0.5 });
}

function resetState() {
  recordingState = {
    isRecording: false,
    tabId: null,
    meetingId: null,
    startTime: null,
    meetingTitle: '',
    meetingUrl: ''
  };
  saveState();
}
