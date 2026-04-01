#!/bin/bash
set -e

# Start D-Bus
mkdir -p /var/run/dbus
dbus-daemon --system --fork || true

# Start PulseAudio with a null sink for audio capture
pulseaudio --start \
  --load="module-native-protocol-unix" \
  --load="module-null-sink sink_name=default_null sink_properties=device.description=DefaultNull" \
  --exit-idle-time=-1 \
  --daemon || true

# Give PulseAudio a moment to start
sleep 1

echo "PulseAudio started"
echo "Starting EchoBrief Bot Service on port ${PORT:-3001}"

exec node dist/index.js
