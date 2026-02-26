// EchoBrief Offscreen Document - Records tab audio (+ microphone when available)
// Runs in extension context, can use getUserMedia with chromeMediaSourceId
// Sends periodic heartbeat to keep the background service worker alive

const ECHOBRIEF_API_URL = 'https://qjhysesjocanowmdkeme.supabase.co/functions/v1';
const HEARTBEAT_INTERVAL_MS = 20000;

let recorderState = {
  stream: null,
  micStream: null,
  audioContext: null,
  mediaRecorder: null,
  audioChunks: [],
  startTime: null,
  meetingTitle: '',
  meetingUrl: '',
  authToken: null
};

let heartbeatInterval = null;

function startHeartbeat() {
  stopHeartbeat();
  heartbeatInterval = setInterval(() => {
    chrome.runtime.sendMessage({ type: 'OFFSCREEN_HEARTBEAT' }).catch(() => {});
  }, HEARTBEAT_INTERVAL_MS);
}

function stopHeartbeat() {
  if (heartbeatInterval) {
    clearInterval(heartbeatInterval);
    heartbeatInterval = null;
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.target !== 'offscreen') return;

  if (message.type === 'start-recording') {
    startRecording(message.data).then(sendResponse).catch((err) => {
      console.error('Offscreen start error:', err);
      sendResponse({ error: err.message });
    });
    return true;
  }

  if (message.type === 'stop-recording') {
    stopRecording();
    sendResponse({ ok: true });
    return false;
  }
});

async function startRecording({ streamId, meetingTitle, meetingUrl, authToken }) {
  // Capture tab audio (required — this is the meeting's incoming audio)
  const tabStream = await navigator.mediaDevices.getUserMedia({
    audio: {
      mandatory: {
        chromeMediaSource: 'tab',
        chromeMediaSourceId: streamId
      }
    },
    video: false
  });

  let recordingStream = tabStream;
  let micStream = null;
  let audioContext = null;

  // Try to also capture microphone so the user's own voice is in the recording
  try {
    micStream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      video: false
    });

    audioContext = new AudioContext();
    const dest = audioContext.createMediaStreamDestination();
    audioContext.createMediaStreamSource(tabStream).connect(dest);
    audioContext.createMediaStreamSource(micStream).connect(dest);
    recordingStream = dest.stream;
  } catch (err) {
    console.warn('Microphone not available, recording tab audio only:', err.message);
  }

  recorderState = {
    stream: tabStream,
    micStream,
    audioContext,
    mediaRecorder: null,
    audioChunks: [],
    startTime: Date.now(),
    meetingTitle,
    meetingUrl,
    authToken
  };

  const mediaRecorder = new MediaRecorder(recordingStream, { mimeType: 'audio/webm;codecs=opus' });
  recorderState.mediaRecorder = mediaRecorder;

  mediaRecorder.ondataavailable = (e) => {
    if (e.data.size > 0) recorderState.audioChunks.push(e.data);
  };

  mediaRecorder.onstop = () => handleRecordingStopped();

  mediaRecorder.onerror = (event) => {
    console.error('MediaRecorder error:', event.error);
    stopHeartbeat();
    cleanupStreams();
    chrome.runtime.sendMessage({ type: 'RECORDING_FAILED' }).catch(() => {});
    requestClose();
  };

  // If the tab's audio track ends (e.g. tab navigated away), stop gracefully
  tabStream.getTracks().forEach((track) => {
    track.addEventListener('ended', () => {
      console.warn('Tab audio track ended unexpectedly');
      if (recorderState.mediaRecorder && recorderState.mediaRecorder.state === 'recording') {
        recorderState.mediaRecorder.stop();
      }
    });
  });

  mediaRecorder.start(1000);
  startHeartbeat();
}

function stopRecording() {
  stopHeartbeat();
  if (recorderState.mediaRecorder && recorderState.mediaRecorder.state !== 'inactive') {
    recorderState.mediaRecorder.stop();
  }
  // Stream cleanup happens in handleRecordingStopped after final data is captured
}

function cleanupStreams() {
  if (recorderState.stream) {
    recorderState.stream.getTracks().forEach((t) => t.stop());
  }
  if (recorderState.micStream) {
    recorderState.micStream.getTracks().forEach((t) => t.stop());
  }
  if (recorderState.audioContext) {
    recorderState.audioContext.close().catch(() => {});
  }
}

function requestClose() {
  chrome.runtime.sendMessage({ type: 'CLOSE_OFFSCREEN' }).catch(() => {});
}

async function handleRecordingStopped() {
  stopHeartbeat();
  cleanupStreams();

  const authToken = recorderState.authToken;
  if (!authToken) {
    chrome.runtime.sendMessage({ type: 'RECORDING_FAILED' }).catch(() => {});
    requestClose();
    return;
  }

  const audioBlob = new Blob(recorderState.audioChunks, { type: 'audio/webm' });
  const durationSeconds = Math.floor((Date.now() - recorderState.startTime) / 1000);

  if (audioBlob.size < 1000 || durationSeconds < 5) {
    chrome.runtime.sendMessage({ type: 'RECORDING_FAILED' }).catch(() => {});
    requestClose();
    return;
  }

  try {
    const formData = new FormData();
    formData.append('audio', audioBlob, 'recording.webm');
    formData.append('title', recorderState.meetingTitle);
    formData.append('source', 'chrome-extension');
    formData.append('meeting_url', recorderState.meetingUrl);
    formData.append('duration_seconds', durationSeconds.toString());

    const response = await fetch(`${ECHOBRIEF_API_URL}/upload-recording`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${authToken}` },
      body: formData
    });

    if (!response.ok) throw new Error(`Upload failed: ${response.status}`);

    const result = await response.json();
    chrome.runtime.sendMessage({ type: 'RECORDING_COMPLETED', meetingId: result.meetingId }).catch(() => {});
  } catch (err) {
    console.error('Upload error:', err);
    chrome.runtime.sendMessage({ type: 'RECORDING_FAILED' }).catch(() => {});
  } finally {
    requestClose();
  }
}
