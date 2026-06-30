# whatsapp-agent

Save something to your WhatsApp **"Message Yourself"** chat — a link, or just a
note — and an agent explores it, researches sources on the web, and replies in
the same chat with a tight, **cited** briefing.

## How it works

```
You → WhatsApp self-chat
   │
   1. RECEIVE   listen to your "Message Yourself" chat (whatsapp-web.js)
   2. EXPLORE   extract the readable content behind any link(s)
   3. RESEARCH  web search for relevant sources / citations (Tavily)
   4. SUMMARIZE LLM writes a cited briefing (OpenAI or Gemini)
   5. REPLY     post the briefing back into the same chat
```

**Supported inputs:** plain text, web links/articles, **Twitter/X** posts (via
fxtwitter), and **Instagram** posts/reels (caption + metadata). Reels and tweets
that contain video are **transcribed with Whisper** (download `og:video` / tweet
MP4 → OpenAI `whisper-1`) so spoken-only content is understood too.

## Commands

Not everything needs a research reply. Steer each message with a keyword
(anything **without** a keyword is researched, as above):

| Send | Does |
|------|------|
| `save <link/note>` | 📌 Store it, no research. |
| `ask <link/question>` | 🔎 Research + cited briefing (same as the default). |
| `remind me <when>: <note>` | ⏰ Ping you back later. e.g. `remind me in 2h: call mom`, `remind me tomorrow 9am: review PR`. |
| `list` | 🗂️ Show recent saved items + pending reminders. |
| `find <text>` | 🔍 Search saved items. |
| `done <#id>` | ✅ Clear a saved item (id from `list`). |
| `cancel <Rid>` | 🗑️ Drop a reminder. |
| `help` | ❓ Show this cheatsheet in chat. |

Saved items and reminders live in a small JSON file on the persistent volume,
so they survive restarts. Reminders are checked every ~30s and delivered into
your self-chat — they fire even after a redeploy.

## Dashboard

A plain, no-JS web page lists everything you've saved and every pending
reminder, with one-click **done** / **cancel**:

```
http://<your-server-ip>:8080
```

It binds to **localhost only** until you set `WEB_PASSWORD` (then it serves on
all interfaces behind HTTP Basic auth). On AWS, also open the port in the
security group — ideally restricted to your own IP. `GET /health` is always
open for uptime checks; `GET /api/items` and `/api/reminders` return JSON.

## Setup

1. **Install** (Node 18+):
   ```bash
   npm install
   ```
2. **Configure** — copy `.env.example` to `.env` and fill in:
   - `OPENAI_API_KEY` and/or `GEMINI_API_KEY`
   - `LLM_PROVIDER` = `openai` or `gemini`
   - `TAVILY_API_KEY` for web research (recommended)
3. **Test the pipeline** without WhatsApp:
   ```bash
   node scripts/smoke.js "https://some-article-url"
   node scripts/smoke.js "a plain-text question or topic"
   ```
4. **Run the agent**:
   ```bash
   npm start
   ```
   On first run, scan the QR code (WhatsApp → Settings → Linked devices → Link a
   device). The session is cached in `.wwebjs_auth/` so you only scan once.
   Then send a link or note to your own chat and wait for the ✅ reply.

## Configuration (`.env`)

| Key | Default | Purpose |
|-----|---------|---------|
| `LLM_PROVIDER` | `openai` | `openai` or `gemini` |
| `OPENAI_API_KEY` / `OPENAI_MODEL` | — / `gpt-4o-mini` | OpenAI summarizer |
| `GEMINI_API_KEY` / `GEMINI_MODEL` | — / `gemini-1.5-flash` | Gemini summarizer |
| `TAVILY_API_KEY` | — | Web research; if empty, research is skipped |
| `RESEARCH_MAX_RESULTS` | `5` | Sources per query |
| `TRANSCRIBE_MEDIA` | `true` | Transcribe reel/tweet video audio (needs `OPENAI_API_KEY`) |
| `WHISPER_MODEL` | `whisper-1` | Transcription model |
| `MIN_TEXT_LENGTH` | `12` | Min length for a no-link note to trigger |
| `DEBUG` | `false` | Verbose logging |

## Project layout

```
src/
  index.js       entry point + lifecycle (client + web server)
  config.js      env config + validation
  net.js         network hardening (IPv4 + connect-timeout/retries)
  whatsapp.js    whatsapp-web.js client + self-chat listener + command router
  commands.js    keyword parsing + natural-language reminder time parsing
  store.js       JSON datastore (saved items, reminders, meta) on /data
  reminders.js   scheduler that delivers due reminders into the self-chat
  web.js         plain HTML dashboard (built-in http, no deps)
  format.js      shared time/text/HTML formatting helpers
  pipeline.js    orchestrates explore → research → summarize
  extract.js     URL detection + dispatch (article / tweet / instagram)
  social.js      Twitter/X (fxtwitter) + Instagram (crawler-UA og) extractors
  html.js        shared fetch + HTML/OG-meta helpers
  transcribe.js  download reel/tweet video → Whisper transcript
  research.js    Tavily web search
  summarize.js   prompt + WhatsApp-formatted briefing
  llm/           provider abstraction (openai.js, gemini.js, index.js)
scripts/
  smoke.js           run the pipeline without WhatsApp/Chromium
  commands-smoke.js  test commands + store + dashboard offline
```

## Deployment

This is a stateful service (persistent Chromium session) — host it on an
always-on instance with a persistent volume (AWS EC2/Lightsail + Docker), not on
serverless. See **[DEPLOY.md](DEPLOY.md)** for the full AWS walkthrough. Quick
local container run:

```bash
docker compose up -d --build
docker compose logs -f   # scan the QR on first run
```

## Notes

- **Unofficial WhatsApp automation.** `whatsapp-web.js` drives WhatsApp Web under
  your own number. It's against WhatsApp's ToS and carries a small ban risk; keep
  volume low. This is the standard approach for personal "message yourself" tools.
- The agent ignores its own replies (they're tagged with a marker) and only acts
  on text messages in your self-chat.
