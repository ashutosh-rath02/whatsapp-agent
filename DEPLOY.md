# Deploying whatsapp-agent on AWS

This is a **stateful** service: it runs a headless Chromium logged in as your
WhatsApp number and keeps the session on disk. So it needs an **always-on
instance with a persistent volume** — EC2 (or Lightsail), **not** Lambda/Fargate.

## 1. Launch an instance

- **Type:** `t3.small` (2 GB RAM) minimum; `t3.medium` (4 GB) is comfortable —
  headless Chromium is memory-hungry.
- **OS:** Ubuntu 22.04/24.04 LTS.
- **Disk:** 16 GB gp3 EBS (the session + image fit easily).
- **Security group:** the agent itself only makes outbound connections. To reach
  the **web dashboard**, open its port (default **8080**) inbound — ideally
  restricted to your own IP — and keep SSH (22) restricted to you too. If you
  don't want the dashboard public, leave the port closed and reach it over an
  SSH tunnel instead: `ssh -L 8080:localhost:8080 user@<ip>`.

## 2. Install Docker

```bash
sudo apt-get update && sudo apt-get install -y docker.io docker-compose-v2
sudo usermod -aG docker $USER && newgrp docker
```

## 3. Get the code + secrets

```bash
git clone <your-repo-url> whatsapp-agent && cd whatsapp-agent
cp .env.example .env
nano .env          # paste OPENAI_API_KEY / GEMINI_API_KEY / TAVILY_API_KEY
```

In `.env`, to use the dashboard on your server IP also set:

```bash
WEB_PASSWORD=something-strong   # required to expose the dashboard publicly
AGENT_TZ=Asia/Kolkata           # so reminder times show in your zone (box is UTC)
```

`.env` stays on the instance and is gitignored. For stronger secret handling,
pull values from AWS SSM Parameter Store / Secrets Manager into the environment
instead of a file.

## 4. Build & run

```bash
docker compose up -d --build
docker compose logs -f
```

On first run the logs print a **QR code** — scan it with your phone:
**WhatsApp → Settings → Linked devices → Link a device**. Wait for
`Ready ✅ Listening to your self-chat`. The session is saved in the `wa-session`
volume, so you won't rescan on restarts/redeploys.

Then send a link or note to your **"Message Yourself"** chat and watch for the
✅ reply. Try the commands too: `save <note>`, `remind me in 1h: test`, `list`,
`help`.

**Dashboard:** with `WEB_PASSWORD` set and port 8080 open, browse to
`http://<your-ec2-ip>:8080` (user `admin`, the password you chose) to see your
saved items and reminders, with one-click done/cancel.

## 5. Operate

```bash
docker compose logs -f            # follow activity
docker compose restart            # restart (session persists)
docker compose up -d --build      # deploy new code (git pull first)
docker compose down               # stop (keeps the volume)
```

- **Single instance only.** Two running instances linked to the same number =
  duplicate replies.
- **Persistence:** the session lives in the `wa-session` Docker volume on the
  instance's EBS. It survives container restarts and redeploys. If you
  *terminate* the EC2 instance, the volume is gone and you re-link once.

## 6. Optional: Instagram reel audio transcription

Reels are summarized from their caption by default (no setup). To also
transcribe the spoken audio you need ffmpeg + yt-dlp **and** Instagram auth
cookies (a server has no logged-in browser):

1. Build with the media tools:
   ```bash
   docker compose build --build-arg INSTALL_MEDIA_TOOLS=true
   ```
2. Export your Instagram cookies to a `cookies.txt` (Netscape format, via a
   browser extension), copy it onto the instance, and mount + point at it:
   ```yaml
   # docker-compose.yml
   volumes:
     - wa-session:/data
     - ./cookies.txt:/data/cookies.txt:ro
   ```
   ```bash
   # .env
   YTDLP_COOKIES_FILE=/data/cookies.txt
   ```

Cookies expire periodically and need refreshing — that's the maintenance cost of
reel-audio transcription.

## Environment knobs (see `.env.example`)

| Var | Purpose |
|-----|---------|
| `LLM_PROVIDER`, `*_API_KEY`, `*_MODEL` | which model summarizes |
| `TAVILY_API_KEY` | web research |
| `TRANSCRIBE_MEDIA` | enable tweet/reel audio transcription |
| `YTDLP_COOKIES_FILE` | Instagram auth for reel audio |
| `COMMANDS_ENABLED` | keyword routing (save / ask / remind / list); default on |
| `AGENT_TZ` | timezone for showing reminder/saved times (box is UTC) |
| `WEB_ENABLED`, `WEB_PORT` | dashboard on/off and port (default 8080) |
| `WEB_USER`, `WEB_PASSWORD` | dashboard auth; no password ⇒ localhost-only |
| `DB_PATH` | saved-data file (default `/data/agent-data.json` in the image) |
| `NET_FORCE_IPV4` | `auto` (Windows-only) / `true` / `false` — leave default on AWS |
| `PUPPETEER_EXECUTABLE_PATH` | set by the image to system Chromium |
| `WWEBJS_AUTH_PATH` | session location (set to `/data/.wwebjs_auth` in the image) |
