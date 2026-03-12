// EchoBrief Microphone Permission Page
// Opens in a real browser tab so Chrome can show the permission dialog.
// Once granted, the permission persists at the chrome-extension:// origin
// and the offscreen document can use getUserMedia for the mic.

const btn = document.getElementById('grant-btn');
const statusEl = document.getElementById('status');

btn.addEventListener('click', async () => {
  btn.disabled = true;
  btn.textContent = 'Waiting for permission...';
  statusEl.textContent = '';

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach(t => t.stop());

    await chrome.storage.local.set({ micPermissionGranted: true });

    statusEl.className = 'status success';
    statusEl.textContent = '✓ Microphone access granted! Go back to your meeting tab and click Start Recording.';
    btn.textContent = 'Done. Permission Granted';
  } catch (err) {
    await chrome.storage.local.set({ micPermissionGranted: false });

    statusEl.className = 'status error';
    if (err.name === 'NotAllowedError') {
      statusEl.textContent = '✗ Permission denied. Click the button again and select "Allow" when Chrome asks.';
    } else {
      statusEl.textContent = `✗ ${err.message}`;
    }
    btn.disabled = false;
    btn.textContent = 'Try Again';
  }
});

// On page load, check if permission is already granted
(async () => {
  try {
    const result = await navigator.permissions.query({ name: 'microphone' });
    if (result.state === 'granted') {
      await chrome.storage.local.set({ micPermissionGranted: true });
      statusEl.className = 'status success';
      statusEl.textContent = '✓ Microphone access is already granted. You can close this tab and start recording.';
      btn.textContent = 'Already Granted';
      btn.disabled = true;
    }
  } catch {
    // permissions.query not available; user needs to click the button
  }
})();
