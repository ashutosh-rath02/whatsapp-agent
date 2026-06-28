# whatsapp-agent — production image
#
# Stateful service: runs headless Chromium logged in as your WhatsApp number.
# Mount a volume at /data so the session survives restarts/redeploys.
FROM node:22-bookworm-slim

ENV DEBIAN_FRONTEND=noninteractive

# System deps:
#   chromium  — whatsapp-web.js drives this (we use the system one, not a download)
#   tini      — proper PID 1: forwards signals + reaps zombie Chromium procs
#   fonts     — render emoji/text in the headless browser
# Optional (INSTALL_MEDIA_TOOLS=true): ffmpeg + yt-dlp for Instagram reel audio.
ARG INSTALL_MEDIA_TOOLS=false
RUN apt-get update && apt-get install -y --no-install-recommends \
      chromium \
      ca-certificates \
      tini \
      fonts-liberation \
      fonts-noto-color-emoji \
      curl \
  && if [ "$INSTALL_MEDIA_TOOLS" = "true" ]; then \
       apt-get install -y --no-install-recommends ffmpeg \
       && curl -fL https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux \
            -o /usr/local/bin/yt-dlp \
       && chmod a+rx /usr/local/bin/yt-dlp ; \
     fi \
  && rm -rf /var/lib/apt/lists/*

# Use system Chromium; don't let puppeteer fetch its own (set before npm ci).
ENV PUPPETEER_SKIP_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium \
    WWEBJS_AUTH_PATH=/data/.wwebjs_auth \
    NODE_ENV=production

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY src ./src

# Session/auth lives here — mount a persistent volume at /data.
VOLUME ["/data"]

ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "src/index.js"]
