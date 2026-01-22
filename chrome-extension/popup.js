// EchoBrief Popup Script

const ECHOBRIEF_URL = 'https://echobrief.lovable.app';

document.addEventListener('DOMContentLoaded', async () => {
  const contentEl = document.getElementById('content');
  
  // Check if user is logged in
  const { authToken } = await chrome.storage.local.get('authToken');
  
  if (!authToken) {
    showLoginPrompt(contentEl);
    return;
  }
  
  // Get recording status
  chrome.runtime.sendMessage({ type: 'GET_RECORDING_STATUS' }, (response) => {
    if (response?.isRecording) {
      showRecordingStatus(contentEl, response);
    } else {
      showIdleStatus(contentEl);
    }
  });
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

function showIdleStatus(container) {
  container.innerHTML = `
    <div class="status-card">
      <div class="status-header">
        <span class="status-dot ready"></span>
        <span class="status-text">Ready</span>
      </div>
      <div class="status-detail">
        Recording will start automatically when you join a meeting on Google Meet or Zoom.
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
