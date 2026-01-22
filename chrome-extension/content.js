// EchoBrief Content Script
// Injected into meeting pages to show recording status

let statusIndicator = null;
let notificationBanner = null;

// Create floating status indicator
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

// Update status indicator
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

// Show pre-meeting notification
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
        EchoBrief will automatically record this meeting
      </span>
      <button class="echobrief-banner-dismiss" id="echobrief-dismiss">Got it</button>
    </div>
  `;
  
  document.body.appendChild(notificationBanner);
  
  // Auto-dismiss after 5 seconds
  setTimeout(() => {
    if (notificationBanner) {
      notificationBanner.remove();
      notificationBanner = null;
    }
  }, 5000);
  
  // Dismiss on click
  document.getElementById('echobrief-dismiss')?.addEventListener('click', () => {
    if (notificationBanner) {
      notificationBanner.remove();
      notificationBanner = null;
    }
  });
}

// Format duration as MM:SS
function formatDuration(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

// Hide status indicator
function hideStatus() {
  if (statusIndicator) {
    statusIndicator.remove();
    statusIndicator = null;
  }
}

// Listen for messages from background script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('Content script received:', message.type);
  
  switch (message.type) {
    case 'MEETING_DETECTED':
      showNotification(message.title);
      createStatusIndicator();
      updateStatus('preparing', '🟡 Preparing...');
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
      updateStatus('success', '✓ Recording saved');
      setTimeout(hideStatus, 3000);
      break;
      
    case 'RECORDING_UPLOADED':
      updateStatus('success', '✓ Sent for processing');
      setTimeout(hideStatus, 3000);
      break;
      
    case 'RECORDING_ERROR':
      updateStatus('error', `⚠️ ${message.error}`);
      setTimeout(hideStatus, 5000);
      break;
  }
  
  sendResponse({ received: true });
  return true;
});

// Duration timer
let durationInterval = null;
let recordingStartTime = null;

function startDurationTimer() {
  recordingStartTime = Date.now();
  
  if (durationInterval) clearInterval(durationInterval);
  
  durationInterval = setInterval(() => {
    const duration = Math.floor((Date.now() - recordingStartTime) / 1000);
    updateStatus('recording', '', duration);
  }, 1000);
}

function stopDurationTimer() {
  if (durationInterval) {
    clearInterval(durationInterval);
    durationInterval = null;
  }
}

// Cleanup on unload
window.addEventListener('beforeunload', () => {
  stopDurationTimer();
});

console.log('EchoBrief content script loaded');
