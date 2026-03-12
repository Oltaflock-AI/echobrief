// EchoBrief Content Script
// Injected into meeting pages - shows recording status UI only
// Tab capture runs in offscreen document (triggered from popup with user gesture)

let statusIndicator = null;
let notificationBanner = null;

function createStatusIndicator() {
  if (statusIndicator) return;
  
  statusIndicator = document.createElement('div');
  statusIndicator.id = 'echobrief-status';
  statusIndicator.innerHTML = `
    <style>
      #echobrief-status {
        position: fixed;
        top: 16px;
        right: 16px;
        z-index: 999999;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      }
      .echobrief-indicator {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 8px 16px;
        border-radius: 24px;
        font-size: 13px;
        font-weight: 500;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
        backdrop-filter: blur(8px);
        transition: all 0.3s ease;
      }
      .echobrief-indicator.recording {
        background: rgba(220, 38, 38, 0.95);
        color: white;
      }
      .echobrief-indicator.preparing {
        background: rgba(234, 179, 8, 0.95);
        color: #1a1a1a;
      }
      .echobrief-indicator.error {
        background: rgba(239, 68, 68, 0.95);
        color: white;
      }
      .echobrief-indicator.success {
        background: rgba(34, 197, 94, 0.95);
        color: white;
      }
      .echobrief-dot {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background: currentColor;
      }
      .echobrief-dot.pulse {
        animation: pulse 1.5s infinite;
      }
      @keyframes pulse {
        0%, 100% { opacity: 1; transform: scale(1); }
        50% { opacity: 0.5; transform: scale(1.2); }
      }
      .echobrief-duration {
        font-variant-numeric: tabular-nums;
        opacity: 0.9;
      }
    </style>
    <div class="echobrief-indicator preparing">
      <span class="echobrief-dot"></span>
      <span class="echobrief-text">Preparing...</span>
    </div>
  `;
  
  document.body.appendChild(statusIndicator);
}

function updateStatus(status, text, duration = null) {
  if (!statusIndicator) createStatusIndicator();
  
  const indicator = statusIndicator.querySelector('.echobrief-indicator');
  const dot = statusIndicator.querySelector('.echobrief-dot');
  const textEl = statusIndicator.querySelector('.echobrief-text');
  
  indicator.className = `echobrief-indicator ${status}`;
  
  if (status === 'recording') {
    dot.classList.add('pulse');
    textEl.innerHTML = duration 
      ? `🔴 Recording <span class="echobrief-duration">${formatDuration(duration)}</span>`
      : '🔴 Recording';
  } else {
    dot.classList.remove('pulse');
    textEl.textContent = text;
  }
}

function showNotification(title) {
  if (notificationBanner) return;
  
  notificationBanner = document.createElement('div');
  notificationBanner.id = 'echobrief-notification';
  notificationBanner.innerHTML = `
    <style>
      #echobrief-notification {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        z-index: 999998;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      }
      .echobrief-banner {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 12px;
        padding: 12px 24px;
        background: linear-gradient(135deg, #3b82f6 0%, #6366f1 100%);
        color: white;
        font-size: 14px;
      }
      .echobrief-banner-icon {
        font-size: 20px;
      }
      .echobrief-banner-text {
        font-weight: 500;
      }
      .echobrief-banner-dismiss {
        background: rgba(255, 255, 255, 0.2);
        border: none;
        color: white;
        padding: 4px 12px;
        border-radius: 4px;
        cursor: pointer;
        font-size: 12px;
        margin-left: 12px;
      }
      .echobrief-banner-dismiss:hover {
        background: rgba(255, 255, 255, 0.3);
      }
    </style>
    <div class="echobrief-banner">
      <span class="echobrief-banner-icon">🎙️</span>
      <span class="echobrief-banner-text">
        Click the EchoBrief extension icon and Start Recording to capture this meeting
      </span>
      <button class="echobrief-banner-dismiss" id="echobrief-dismiss">Got it</button>
    </div>
  `;
  
  document.body.appendChild(notificationBanner);
  
  setTimeout(() => {
    if (notificationBanner) {
      notificationBanner.remove();
      notificationBanner = null;
    }
  }, 5000);
  
  document.getElementById('echobrief-dismiss')?.addEventListener('click', () => {
    if (notificationBanner) {
      notificationBanner.remove();
      notificationBanner = null;
    }
  });
}

function formatDuration(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

function hideStatus() {
  if (statusIndicator) {
    statusIndicator.remove();
    statusIndicator = null;
  }
}

let micWarningBanner = null;

function showMicWarningBanner() {
  if (micWarningBanner) return;

  micWarningBanner = document.createElement('div');
  micWarningBanner.id = 'echobrief-mic-warning';
  micWarningBanner.innerHTML = `
    <style>
      #echobrief-mic-warning {
        position: fixed;
        bottom: 16px;
        left: 50%;
        transform: translateX(-50%);
        z-index: 999998;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      }
      .echobrief-mic-banner {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 10px 20px;
        background: rgba(234, 179, 8, 0.95);
        color: #1a1a1a;
        border-radius: 12px;
        font-size: 13px;
        font-weight: 500;
        box-shadow: 0 4px 16px rgba(0,0,0,0.3);
        backdrop-filter: blur(8px);
      }
      .echobrief-mic-banner button {
        background: rgba(0,0,0,0.15);
        border: none;
        color: #1a1a1a;
        padding: 4px 10px;
        border-radius: 6px;
        cursor: pointer;
        font-size: 12px;
        font-weight: 600;
        white-space: nowrap;
      }
      .echobrief-mic-banner button:hover { background: rgba(0,0,0,0.25); }
    </style>
    <div class="echobrief-mic-banner">
      <span>⚠️ Mic unavailable: recording tab audio only. Your voice won't be captured.</span>
      <button id="echobrief-mic-dismiss">Dismiss</button>
    </div>
  `;

  document.body.appendChild(micWarningBanner);

  document.getElementById('echobrief-mic-dismiss')?.addEventListener('click', () => {
    if (micWarningBanner) {
      micWarningBanner.remove();
      micWarningBanner = null;
    }
  });
}

// --- Recording state tracking ---

let durationInterval = null;
let recordingStartTime = null;
let stateCheckInterval = null;

function startDurationTimer() {
  // Clear any existing timer FIRST, then set the new start time
  if (durationInterval) {
    clearInterval(durationInterval);
    durationInterval = null;
  }
  stopStateCheck();

  recordingStartTime = Date.now();
  
  durationInterval = setInterval(() => {
    if (!recordingStartTime) return;
    const duration = Math.floor((Date.now() - recordingStartTime) / 1000);
    updateStatus('recording', '', duration);
  }, 1000);

  startStateCheck();
}

function stopDurationTimer() {
  if (durationInterval) {
    clearInterval(durationInterval);
    durationInterval = null;
  }
  recordingStartTime = null;
  stopStateCheck();
}

function startStateCheck() {
  stopStateCheck();
  stateCheckInterval = setInterval(() => {
    if (!isExtensionContextValid()) {
      stopDurationTimer();
      hideStatus();
      return;
    }

    try {
      chrome.runtime.sendMessage({ type: 'GET_RECORDING_STATUS' }, (response) => {
        if (chrome.runtime.lastError || !response?.isRecording) {
          if (durationInterval) {
            stopDurationTimer();
            updateStatus('error', '⚠️ Recording stopped unexpectedly');
            setTimeout(hideStatus, 5000);
          }
        }
      });
    } catch {
      stopDurationTimer();
      hideStatus();
    }
  }, 15000);
}

function stopStateCheck() {
  if (stateCheckInterval) {
    clearInterval(stateCheckInterval);
    stateCheckInterval = null;
  }
}

function cleanupRecordingUI() {
  stopDurationTimer();
}

// --- Message Handling ---

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('Content script received:', message.type);

  switch (message.type) {
    case 'MEETING_DETECTED':
      showNotification(message.title);
      createStatusIndicator();
      updateStatus('preparing', '🟡 Click the extension icon and Start Recording');
      break;

    case 'RECORDING_STARTED':
      if (notificationBanner) {
        notificationBanner.remove();
        notificationBanner = null;
      }
      updateStatus('recording', '', 0);
      startDurationTimer();
      break;

    case 'RECORDING_STOPPED':
      cleanupRecordingUI();
      updateStatus('success', '✓ Recording saved');
      setTimeout(hideStatus, 3000);
      break;

    case 'RECORDING_UPLOADED':
      cleanupRecordingUI();
      updateStatus('success', '✓ Sent for processing');
      setTimeout(hideStatus, 3000);
      break;

    case 'MIC_UNAVAILABLE':
      showMicWarningBanner();
      break;

    case 'RECORDING_ERROR':
      cleanupRecordingUI();
      updateStatus('error', `⚠️ ${message.error}`);
      setTimeout(hideStatus, 5000);
      break;
  }

  sendResponse({ received: true });
  return true;
});

window.addEventListener('beforeunload', () => {
  cleanupRecordingUI();
});

function isExtensionContextValid() {
  try {
    return !!chrome.runtime?.id;
  } catch {
    return false;
  }
}

// Listen for messages from the web app (for status checks)
window.addEventListener('message', (event) => {
  if (event.source !== window) return;
  if (!isExtensionContextValid()) return;
  
  if (event.data?.type === 'ECHOBRIEF_EXTENSION_PING') {
    window.postMessage({ 
      type: 'ECHOBRIEF_EXTENSION_PONG',
      extensionId: chrome.runtime.id
    }, '*');
  }
  
  if (event.data?.type === 'ECHOBRIEF_GET_STATUS') {
    try {
      chrome.runtime.sendMessage({ type: 'GET_RECORDING_STATUS' }, (response) => {
        window.postMessage({
          type: 'ECHOBRIEF_STATUS_RESPONSE',
          status: response || { isRecording: false }
        }, '*');
      });
    } catch {
      window.postMessage({
        type: 'ECHOBRIEF_STATUS_RESPONSE',
        status: { isRecording: false }
      }, '*');
    }
  }

  if (event.data?.type === 'ECHOBRIEF_SET_TOKEN' && event.data.token) {
    try {
      chrome.runtime.sendMessage({ type: 'SET_AUTH_TOKEN', token: event.data.token });
    } catch {}
  }
});

if (isExtensionContextValid()) {
  const marker = document.createElement('div');
  marker.id = 'echobrief-extension-marker';
  marker.style.display = 'none';
  marker.dataset.extensionId = chrome.runtime.id;
  document.body.appendChild(marker);
}

console.log('EchoBrief content script loaded');
