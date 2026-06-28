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
  index.js       entry point + lifecycle
  config.js      env config + validation
  net.js         network hardening (IPv4 + connect-timeout/retries)
  whatsapp.js    whatsapp-web.js client + self-chat listener
  pipeline.js    orchestrates explore → research → summarize
  extract.js     URL detection + dispatch (article / tweet / instagram)
  social.js      Twitter/X (fxtwitter) + Instagram (crawler-UA og) extractors
  html.js        shared fetch + HTML/OG-meta helpers
  transcribe.js  download reel/tweet video → Whisper transcript
  research.js    Tavily web search
  summarize.js   prompt + WhatsApp-formatted briefing
  llm/           provider abstraction (openai.js, gemini.js, index.js)
scripts/
  smoke.js       run the pipeline without WhatsApp/Chromium
```

## Notes

- **Unofficial WhatsApp automation.** `whatsapp-web.js` drives WhatsApp Web under
  your own number. It's against WhatsApp's ToS and carries a small ban risk; keep
  volume low. This is the standard approach for personal "message yourself" tools.
- The agent ignores its own replies (they're tagged with a marker) and only acts
  on text messages in your self-chat.
