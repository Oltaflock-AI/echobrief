// EchoBrief Popup Script
const ECHOBRIEF_URL = 'https://echobrief-ten.vercel.app';

document.addEventListener('DOMContentLoaded', async () => {
  const contentEl = document.getElementById('content');
  
  // Check if user is logged in
  const { authToken } = await chrome.storage.local.get('authToken');
  
  if (!authToken) {
    showLoginPrompt(contentEl);
    return;
  }
  
  // Get recording status and current tab
  const [statusResponse, tabs] = await Promise.all([
    new Promise((r) => chrome.runtime.sendMessage({ type: 'GET_RECORDING_STATUS' }, r)),
    chrome.tabs.query({ active: true, currentWindow: true })
  ]);

  const currentTab = tabs[0];
  const url = currentTab?.url || '';
  const isMeetingTab = /^https:\/\/meet\.google\.com\/.+\/?/.test(url) || /^https:\/\/.*\.zoom\.us\/(wc|j)\//.test(url);

  if (statusResponse?.isRecording) {
    showRecordingStatus(contentEl, statusResponse);
  } else if (isMeetingTab) {
    showMeetingReadyStatus(contentEl, currentTab);
  } else {
    showIdleStatus(contentEl);
  }
});

function showLoginPrompt(container) {
  container.innerHTML = `
    <div class="login-prompt">
      <p>Log in to EchoBrief to enable automatic meeting recording.</p>
      <button class="btn btn-primary" id="login-btn">Open EchoBrief</button>
    </div>
  `;
  
  document.getElementById('login-btn').addEventListener('click', () => {
    chrome.tabs.create({ url: ECHOBRIEF_URL });
  });
}

function showRecordingStatus(container, status) {
  container.innerHTML = `
    <div class="status-card">
      <div class="status-header">
        <span class="status-dot recording"></span>
        <span class="status-text">Recording</span>
      </div>
      <div class="status-detail">${status.meetingTitle || 'Meeting'}</div>
      <div class="duration" id="duration">${formatDuration(status.duration || 0)}</div>
    </div>
    <div class="actions">
      <button class="btn btn-danger" id="stop-btn">Stop Recording</button>
    </div>
  `;
  
  // Update duration every second
  let duration = status.duration || 0;
  setInterval(() => {
    duration++;
    const durationEl = document.getElementById('duration');
    if (durationEl) {
      durationEl.textContent = formatDuration(duration);
    }
  }, 1000);
  
  document.getElementById('stop-btn').addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: 'STOP_RECORDING' });
    showIdleStatus(container);
  });
}

async function showMeetingReadyStatus(container, tab) {
  // Check if microphone permission has been set up
  const { micPermissionGranted } = await chrome.storage.local.get('micPermissionGranted');
  const micWarning = micPermissionGranted ? '' : `
    <div class="mic-warning" style="background:#2a2000;border:1px solid #554400;border-radius:8px;padding:8px 12px;margin-top:8px;font-size:12px;color:#ffcc00;">
      ⚠️ Microphone not set up. <a href="#" id="setup-mic" style="color:#7c9cff;text-decoration:underline;cursor:pointer;">Set up now</a>
    </div>
  `;

  container.innerHTML = `
    <div class="status-card">
      <div class="status-header">
        <span class="status-dot ready"></span>
        <span class="status-text">Meeting detected</span>
      </div>
      <div class="status-detail">
        Click below to start recording this meeting.
        ${micWarning}
      </div>
    </div>
    <div class="actions">
      <button class="btn btn-primary" id="start-btn">Start Recording</button>
    </div>
  `;

  // "Set up now" link opens the mic permission page
  document.getElementById('setup-mic')?.addEventListener('click', (e) => {
    e.preventDefault();
    chrome.tabs.create({ url: chrome.runtime.getURL('mic-permission.html') });
  });
  
  document.getElementById('start-btn').addEventListener('click', async () => {
    const btn = document.getElementById('start-btn');
    btn.disabled = true;
    btn.textContent = 'Starting...';

    // Re-check mic permission; if still not granted, redirect to setup page
    const { micPermissionGranted: micReady } = await chrome.storage.local.get('micPermissionGranted');
    if (!micReady) {
      chrome.tabs.create({ url: chrome.runtime.getURL('mic-permission.html') });
      btn.disabled = false;
      btn.textContent = 'Start Recording';
      return;
    }

    try {
      const streamId = await chrome.tabCapture.getMediaStreamId({ targetTabId: tab.id });
      await chrome.runtime.sendMessage({
        type: 'START_RECORDING_WITH_STREAM_ID',
        streamId,
        tabId: tab.id,
        url: tab.url
      });
      showRecordingStatus(container, { isRecording: true, meetingTitle: 'Meeting', duration: 0 });
    } catch (err) {
      btn.disabled = false;
      btn.textContent = 'Start Recording';
      alert(err.message || 'Failed to start recording. Make sure this tab is active.');
    }
  });
}

function showIdleStatus(container) {
  container.innerHTML = `
    <div class="status-card">
      <div class="status-header">
        <span class="status-dot ready"></span>
        <span class="status-text">Ready</span>
      </div>
      <div class="status-detail">
        Open a Google Meet or Zoom Web meeting, then click the extension and click Start Recording.
      </div>
    </div>
    <div class="actions">
      <button class="btn btn-secondary" id="dashboard-btn">View Recordings</button>
    </div>
  `;
  
  document.getElementById('dashboard-btn').addEventListener('click', () => {
    chrome.tabs.create({ url: `${ECHOBRIEF_URL}/recordings` });
  });
}

function formatDuration(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}
