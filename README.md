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
| `news` | 🗞️ AI digest on demand · `news sources` lists what's watched. |
| `here` | 📍 Redirect reminders/jobs/news to wherever you send this (see **Notifications** below). |
| `help` | ❓ Show this cheatsheet in chat. |

Saved items and reminders live in a small JSON file on the persistent volume,
so they survive restarts. Reminders are checked every ~30s and delivered into
your self-chat — they fire even after a redeploy.

## Notifications

WhatsApp doesn't push a phone notification for messages sent to your
self-chat from a linked device (this bot's own session) — as far as the
phone is concerned, a message you "sent yourself" from another device
doesn't need alerting, even though the content is new. Self-chat still
works fine for typing commands (you're already looking at your phone when
you do that), but reminders, job matches, and the morning digest can go
unnoticed for hours.

**Fix: send `here` in a WhatsApp group with just you in it** (create a
group, add anyone to make it, then remove them). Group messages notify
normally, including from a linked-device bot. From then on, reminders/jobs/
news go to that group instead of self-chat; commands still work from
self-chat as before. Send `here` again from self-chat to switch back.

For safety, `here` only registers a group if you're the only member —
if anyone else is in it, it refuses and tells you why, since everything
sent there (reminders, job search activity, the news digest) would
otherwise be visible to them too.

**If `here` replies "couldn't check this group"**: this is a confirmed,
currently-unresolved bug in the `whatsapp-web.js` library itself, not
this project — [upstream issue #5752](https://github.com/pedroslopez/whatsapp-web.js/issues/5752).
WhatsApp renamed an internal module; the library's group-metadata lookup
throws for every group, every time, on the latest available release —
it's deterministic, not a timing issue, so retrying alone won't help
(the agent already retries automatically before giving up). Once you're
sure it's just you in the group, send **`here confirm`** to register it
without the automated check.

## Morning AI digest

Every morning (default **08:00** in `AGENT_TZ`) the agent polls ~55 sources —
lab blogs, agent-tooling blogs, practitioner newsletters, industry news,
HF Daily Papers, arXiv cs.MA, Hacker News, r/LocalLLaMA — dedupes against
everything it has already shown you, and delivers a tiered digest into your
self-chat, with 3–5 LLM-picked top headlines up top. `news` fetches one on
demand; an item is only ever reported once.

- Catalog: `src/newsSources.js` (probe-verified; audit trail in `docs/SOURCES.md`)
- Mute a source without a rebuild: `NEWS_SOURCES_DISABLED=verge,zvi`
- First deploy: run `node scripts/news-live.js --seed` once (inside the
  container) so day one isn't a 150-item archive dump.

## Dashboard

A plain, no-JS web app — same "old-school newspaper" theme throughout
(Georgia serif, warm paper, dark-mode aware), three pages:

| Page | Shows |
|------|-------|
| `/` | saved items + pending reminders + recent jobs, one-click **done** / **cancel** |
| `/news` | AI digest browsable **by day**, grouped into the same tiers as the WhatsApp digest, with prev/next-day nav and a recent-editions strip |
| `/jobs` | delivered job postings browsable **by day**, `Good fit`/`Stretch` badges, same day nav |

```
http://<your-server-ip>:8080
```

It binds to **localhost only** until you set `WEB_PASSWORD` (then it serves on
all interfaces behind HTTP Basic auth). On AWS, also open the port in the
security group — ideally restricted to your own IP. `GET /health` is always
open for uptime checks; `GET /api/items`, `/api/reminders`, and `/api/jobs`
return JSON. Day navigation on `/news` and `/jobs` is a plain link
(`?day=YYYY-MM-DD`), no JS involved.

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
| `JOBS_ENABLED` | `true` | Job-watch: poll company ATS boards, message new matches |
| `JOBS_POLL_MS` | `1500000` (25 min) | How often to poll every company (min 5 min) |
| `JOBS_MAX_PER_MESSAGE` | `40` | Cap postings shown per message (rest still marked delivered) |

## Project layout

```
src/
  index.js       entry point + lifecycle (client + web server)
  config.js      env config + validation
  net.js         network hardening (IPv4 + connect-timeout/retries)
  whatsapp.js    whatsapp-web.js client + self-chat/group listener + plugin dispatch + `here`
  commands.js    keyword splitting + natural-language reminder time parsing
  plugins/       one file per feature — see "Writing a plugin" below
    index.js       registry: loads the directory, routes keywords, generates help
    research.js    the fallback: explore → research → summarize
    save.js  remind.js  list.js  find.js  done.js  cancel.js  news.js  jobs.js  help.js
  store.js       JSON datastore (saved items, reminders, news, jobs, meta) on /data
  reminders.js   scheduler that delivers due reminders into the self-chat
  news.js        news engine: poll sources → dedupe → digest → morning delivery
  newsSources.js the ~55-stream watch catalog (feeds, scrapes, HN API)
  feeds.js       dependency-free RSS/Atom item extraction
  jobs.js        job-watch engine: poll companies → filter → dedupe → real-time delivery
  jobSources.js  loads data/*.csv into pollable company targets
  jobRelevance.js title-based role filter (SWE/full-stack/backend/frontend/AI/FDE) + fit tag
  csv.js         dependency-free CSV parser (data/*.csv have quoted/commaful fields)
  ats/           one adapter per ATS platform (see docs/JOBS.md)
    index.js       dispatches to the right adapter by company.ats
    greenhouse.js  lever.js  ashby.js  smartrecruiters.js  workable.js  workday.js  oracle.js
  web.js         dashboard server (built-in http, no deps) + routes
  webTheme.js    shared CSS/page-shell/nav for every dashboard page
  webPages.js    /news and /jobs: day-grouped browsing of past digests/postings
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
  commands-smoke.js  test routing + plugins + store + dashboard offline
  news-smoke.js      offline news tests (feed fixtures, dedup, digest build)
  news-live.js       poll all sources for real + print the digest (--seed to init)
  jobs-smoke.js      offline jobs tests (relevance filter, catalog, dedup, overflow cap)
  jobs-live.js       poll every company for real + print the message (--seed to init)
  web-smoke.js       offline tests for /, /news, /jobs: day nav, XSS escaping, empty states
  here-smoke.js      offline tests for `here`: solo-group registration, other-member refusal
```

## Job watch

Polls ~123 companies' ATS boards (Greenhouse/Lever/Ashby/SmartRecruiters/
Workable/Workday/Oracle HCM — see `docs/JOBS.md` for how the catalog and
adapters were built and verified) every `JOBS_POLL_MS` (default 25 min),
filters titles to software/full-stack/backend/frontend/AI/forward-deployed
engineer roles, filters locations to **India only** (a posting with no
recognizable India signal — including an unqualified "Remote" with no
country — is excluded, not guessed at), and messages new matches into your
self-chat in real time — tagged `Good fit` / `Stretch` (never filtered out
by seniority, just labeled). `jobs` polls on demand; `jobs sources` lists
what's watched.

**Before enabling on a fresh deploy**, seed the store so day one doesn't
dump every currently-open posting at once:
```bash
npm run jobs:seed   # or: node scripts/jobs-live.js --seed
```
Run it before the main process starts (see `DEPLOY.md`), though it's safe
either way — every scheduler reloads the store from disk at the start of
each cycle, so a concurrent seed write can't get silently overwritten.

## Writing a plugin

Every feature is a file in `src/plugins/` that default-exports a descriptor.
Drop the file in and it's live — no core file needs editing.

```js
// src/plugins/echo.js
export default {
  name: 'echo',                       // unique id, also the PLUGINS_DISABLED key
  keywords: ['echo', 'say'],          // first word of a message routes here
  help: '🔁 `echo <text>` — repeat it back.',
  order: 80,                          // position in the generated help
  enabled: (config) => true,          // optional runtime gate
  async run(ctx) {
    await ctx.say(ctx.arg || 'nothing to echo');
  },
};
```

`ctx` is the whole surface a plugin gets:

| field | what it is |
|-------|-----------|
| `ctx.arg` | the message minus the keyword |
| `ctx.raw` | the full original message body |
| `ctx.explicit` | `false` when routed here as the fallback |
| `ctx.say(text)` | reply into the chat (agent marker added for you) |
| `ctx.react(emoji)` | react to the triggering message |
| `ctx.msg`, `ctx.chat` | the underlying whatsapp-web.js objects |
| `ctx.registry` | the loaded plugins (used by `help`) |

Rules worth knowing:

- **Exactly one plugin sets `fallback: true`** — currently `research`. It handles
  anything with no recognised keyword.
- **`help` is generated** from each descriptor's `help` string, so it can't drift.
- **Errors are contained**: a throwing plugin replies with the error and reacts
  ❌ instead of taking the message handler down.
- **Files starting with `_`** are helpers, not plugins, and are never loaded.
- **Disable without a rebuild**: `PLUGINS_DISABLED=echo,watch` in `.env`.
- **Plugins never import `whatsapp-web.js`**, which is what lets
  `scripts/commands-smoke.js` run them offline with a fake `ctx`.

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
