FROM node:20-slim

# ── System dependencies ───────────────────────────────────────────────────────
RUN apt-get update && apt-get install -y --no-install-recommends \
    chromium \
    chromium-driver \
    pulseaudio \
    pulseaudio-utils \
    ffmpeg \
    dbus \
    dbus-x11 \
    libnss3 \
    libatk1.0-0 \
    libatk-bridge2.0-0 \
    libcups2 \
    libdrm2 \
    libxcomposite1 \
    libxdamage1 \
    libxfixes3 \
    libxrandr2 \
    libgbm1 \
    libasound2 \
    libpangocairo-1.0-0 \
    libxshmfence1 \
    xvfb \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# ── Playwright environment ────────────────────────────────────────────────────
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
# Use system Chromium
ENV CHROMIUM_PATH=/usr/bin/chromium

# Node environment
ENV NODE_ENV=production
WORKDIR /app

# ── Install deps first for Docker layer cache ─────────────────────────────────
COPY package*.json ./
RUN npm ci --omit=dev && \
    # Also install dev deps needed for build
    npm install --include=dev typescript tsx

# ── Install Playwright system deps (skip browser download — using system chromium) ──
RUN npx playwright install-deps chromium || true

# ── Copy source and build ─────────────────────────────────────────────────────
COPY tsconfig.json ./
COPY src/ ./src/
RUN npm run build

# ── PulseAudio configuration ──────────────────────────────────────────────────
RUN mkdir -p /run/pulse /var/run/dbus && \
    echo "default-server = unix:/run/pulse/native" >> /etc/pulse/client.conf && \
    echo "autospawn = no" >> /etc/pulse/client.conf

# ── Runtime ───────────────────────────────────────────────────────────────────
EXPOSE 3001

# Audio output directory
RUN mkdir -p /tmp/echobrief-audio
ENV AUDIO_OUTPUT_DIR=/tmp/echobrief-audio

# Start PulseAudio daemon then run the service
COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

CMD ["/docker-entrypoint.sh"]
