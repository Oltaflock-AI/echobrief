// EchoBrief Background Service Worker
// Handles tab audio capture and communication with the web app

const ECHOBRIEF_API_URL = 'https://zuljmldniwynmnilnffu.supabase.co/functions/v1';
const MEETING_URL_PATTERNS = [
  /^https:\/\/meet\.google\.com\/.+/,
  /^https:\/\/.*\.zoom\.us\/wc\/.+/,
  /^https:\/\/.*\.zoom\.us\/j\/.+/
];

let recordingState = {
  isRecording: false,
  tabId: null,
  meetingId: null,
  mediaRecorder: null,
  audioChunks: [],
  startTime: null,
  meetingTitle: '',
  meetingUrl: ''
};

// Check if URL is a meeting
function isMeetingUrl(url) {
  return MEETING_URL_PATTERNS.some(pattern => pattern.test(url));
}

// Extract meeting title from URL
function getMeetingTitle(url) {
  try {
    const urlObj = new URL(url);
    if (urlObj.hostname === 'meet.google.com') {
      return `Google Meet - ${urlObj.pathname.slice(1)}`;
    } else if (urlObj.hostname.includes('zoom.us')) {
      const meetingId = urlObj.pathname.split('/').pop();
      return `Zoom Meeting - ${meetingId}`;
    }
  } catch (e) {
    console.error('Error parsing meeting URL:', e);
  }
  return 'Meeting Recording';
}

// Listen for tab updates to detect meeting joins
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url) {
    if (isMeetingUrl(tab.url) && !recordingState.isRecording) {
      console.log('Meeting detected:', tab.url);
      
      // Notify content script to show pre-meeting notification
      chrome.tabs.sendMessage(tabId, {
        type: 'MEETING_DETECTED',
        url: tab.url,
        title: getMeetingTitle(tab.url)
      }).catch(() => {
        // Content script might not be ready yet
        console.log('Content script not ready, will retry');
      });
      
      // Auto-start recording after a short delay to let meeting initialize
      setTimeout(() => {
        if (!recordingState.isRecording) {
          startRecording(tabId, tab.url);
        }
      }, 5000); // Wait 5 seconds for meeting to initialize
    }
  }
});

// Listen for tab closure to stop recording
chrome.tabs.onRemoved.addListener((tabId) => {
  if (recordingState.tabId === tabId && recordingState.isRecording) {
    console.log('Meeting tab closed, stopping recording');
    stopRecording();
  }
});

// Handle messages from content script and popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('Background received message:', message.type);
  
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
        startRecording(sender.tab.id, sender.tab.url);
        sendResponse({ success: true });
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
  }
  
  return true; // Keep message channel open for async response
});

// Start recording tab audio
async function startRecording(tabId, url) {
  if (recordingState.isRecording) {
    console.log('Already recording');
    return;
  }
  
  try {
    console.log('Starting tab capture for tab:', tabId);
    
    // Get auth token
    const { authToken } = await chrome.storage.local.get('authToken');
    if (!authToken) {
      console.error('No auth token - user must log in');
      chrome.tabs.sendMessage(tabId, { 
        type: 'RECORDING_ERROR', 
        error: 'Please log in to EchoBrief first' 
      }).catch(() => {});
      return;
    }
    
    // Capture tab audio
    const stream = await chrome.tabCapture.capture({
      audio: true,
      video: false
    });
    
    if (!stream) {
      throw new Error('Failed to capture tab audio');
    }
    
    // Set up MediaRecorder
    const mediaRecorder = new MediaRecorder(stream, {
      mimeType: 'audio/webm;codecs=opus'
    });
    
    recordingState = {
      isRecording: true,
      tabId,
      mediaRecorder,
      audioChunks: [],
      startTime: Date.now(),
      meetingTitle: getMeetingTitle(url),
      meetingUrl: url,
      meetingId: null,
      stream
    };
    
    mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        recordingState.audioChunks.push(event.data);
      }
    };
    
    mediaRecorder.onstop = async () => {
      console.log('MediaRecorder stopped, processing audio');
      await processRecording();
    };
    
    mediaRecorder.start(1000); // Collect data every second
    
    // Notify content script
    chrome.tabs.sendMessage(tabId, { 
      type: 'RECORDING_STARTED',
      title: recordingState.meetingTitle
    }).catch(() => {});
    
    console.log('Recording started for:', recordingState.meetingTitle);
    
  } catch (error) {
    console.error('Failed to start recording:', error);
    chrome.tabs.sendMessage(tabId, { 
      type: 'RECORDING_ERROR', 
      error: error.message 
    }).catch(() => {});
  }
}

// Stop recording
function stopRecording() {
  if (!recordingState.isRecording || !recordingState.mediaRecorder) {
    console.log('Not recording');
    return;
  }
  
  console.log('Stopping recording');
  
  // Stop the media recorder
  if (recordingState.mediaRecorder.state !== 'inactive') {
    recordingState.mediaRecorder.stop();
  }
  
  // Stop all tracks
  if (recordingState.stream) {
    recordingState.stream.getTracks().forEach(track => track.stop());
  }
  
  // Notify content script
  if (recordingState.tabId) {
    chrome.tabs.sendMessage(recordingState.tabId, { 
      type: 'RECORDING_STOPPED'
    }).catch(() => {});
  }
}

// Process and upload recording
async function processRecording() {
  try {
    const { authToken } = await chrome.storage.local.get('authToken');
    if (!authToken) {
      console.error('No auth token for upload');
      return;
    }
    
    // Create audio blob
    const audioBlob = new Blob(recordingState.audioChunks, { type: 'audio/webm' });
    const durationSeconds = Math.floor((Date.now() - recordingState.startTime) / 1000);
    
    console.log('Processing recording:', {
      title: recordingState.meetingTitle,
      duration: durationSeconds,
      size: audioBlob.size
    });
    
    // Upload to EchoBrief
    const formData = new FormData();
    formData.append('audio', audioBlob, 'recording.webm');
    formData.append('title', recordingState.meetingTitle);
    formData.append('source', 'chrome-extension');
    formData.append('meeting_url', recordingState.meetingUrl);
    formData.append('duration_seconds', durationSeconds.toString());
    
    const response = await fetch(`${ECHOBRIEF_API_URL}/upload-recording`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${authToken}`
      },
      body: formData
    });
    
    if (!response.ok) {
      throw new Error(`Upload failed: ${response.status}`);
    }
    
    const result = await response.json();
    console.log('Recording uploaded successfully:', result);
    
    // Notify content script of success
    if (recordingState.tabId) {
      chrome.tabs.sendMessage(recordingState.tabId, { 
        type: 'RECORDING_UPLOADED',
        meetingId: result.meetingId
      }).catch(() => {});
    }
    
  } catch (error) {
    console.error('Failed to process recording:', error);
    
    // Notify content script of error
    if (recordingState.tabId) {
      chrome.tabs.sendMessage(recordingState.tabId, { 
        type: 'RECORDING_ERROR', 
        error: 'Failed to upload recording'
      }).catch(() => {});
    }
  } finally {
    // Reset state
    recordingState = {
      isRecording: false,
      tabId: null,
      meetingId: null,
      mediaRecorder: null,
      audioChunks: [],
      startTime: null,
      meetingTitle: '',
      meetingUrl: ''
    };
  }
}
