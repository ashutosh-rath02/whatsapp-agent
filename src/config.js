import './net.js'; // network hardening (IPv4 + connect timeout) — must load first
import 'dotenv/config';

function bool(v, dflt = false) {
  if (v === undefined) return dflt;
  return ['1', 'true', 'yes', 'on'].includes(String(v).toLowerCase());
}

export const config = {
  llm: {
    provider: (process.env.LLM_PROVIDER || 'openai').toLowerCase(), // 'openai' | 'gemini'
    openai: {
      apiKey: process.env.OPENAI_API_KEY || '',
      model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
    },
    gemini: {
      apiKey: process.env.GEMINI_API_KEY || '',
      model: process.env.GEMINI_MODEL || 'gemini-1.5-flash',
    },
  },
  research: {
    tavilyApiKey: process.env.TAVILY_API_KEY || '',
    maxResults: Number(process.env.RESEARCH_MAX_RESULTS || 5),
  },
  transcription: {
    // Transcribe reel / tweet video audio with Whisper. Needs OPENAI_API_KEY.
    enabled: bool(process.env.TRANSCRIBE_MEDIA, true) && !!process.env.OPENAI_API_KEY,
    model: process.env.WHISPER_MODEL || 'whisper-1',
    // Skip downloads larger than this (Whisper API caps at 25 MB).
    maxBytes: Number(process.env.TRANSCRIBE_MAX_BYTES || 24 * 1024 * 1024),
    // For login-gated sites (Instagram), yt-dlp needs auth cookies. Point this
    // at an exported Netscape-format cookies.txt, or name a browser to read
    // from (the latter is blocked by Chrome's app-bound encryption on Windows).
    ytdlpCookiesFile: process.env.YTDLP_COOKIES_FILE || '',
    ytdlpCookiesBrowser: process.env.YTDLP_COOKIES_BROWSER || '',
  },
  agent: {
    // Only act on self-chat messages whose plain text is at least this long
    // (links always trigger regardless of length).
    minTextLength: Number(process.env.MIN_TEXT_LENGTH || 12),
    // Marker prepended to the agent's own replies so it never processes them.
    replyMarker: '🔎 *Agent summary*',
    // Explicit keyword routing (save / ask / remind / list …). Off = always research.
    commandsEnabled: bool(process.env.COMMANDS_ENABLED, true),
    // IANA timezone for displaying reminder/saved times (e.g. Asia/Kolkata).
    // Falls back to TZ, else the host default.
    timezone: process.env.AGENT_TZ || process.env.TZ || '',
  },
  reminders: {
    enabled: bool(process.env.REMINDERS_ENABLED, true),
    // How often to check for due reminders (min 5s).
    pollMs: Math.max(5000, Number(process.env.REMINDERS_POLL_MS || 30000)),
  },
  news: {
    // Morning AI digest: poll ~50 sources (src/newsSources.js), dedupe, and
    // deliver a tiered summary into the self-chat once a day.
    enabled: bool(process.env.NEWS_ENABLED, true),
    // Local time (HH:MM in agent.timezone) after which the daily digest fires.
    digestTime: process.env.NEWS_DIGEST_TIME || '08:00',
    // Ignore feed items older than this many days (guards first-run floods).
    maxAgeDays: Number(process.env.NEWS_MAX_AGE_DAYS || 7),
    // Cap on digest length, spread across sources.
    maxItems: Number(process.env.NEWS_MAX_ITEMS || 30),
    // Let the LLM flag 3–5 top headlines at the top of the digest.
    llmPicks: bool(process.env.NEWS_LLM_PICKS, true),
  },
  jobs: {
    // Job-watch: poll ~130 companies' ATS boards, filter to SWE/full-stack/
    // backend/frontend/AI/FDE roles, deliver new matches in real time.
    enabled: bool(process.env.JOBS_ENABLED, true),
    // How often to poll every company (min 5 min — be polite to ~130 hosts).
    pollMs: Math.max(5 * 60 * 1000, Number(process.env.JOBS_POLL_MS || 25 * 60 * 1000)),
    // Cap on postings shown per message (large companies post in bulk across
    // many cities for the same role) — the rest are still marked delivered,
    // never re-sent, just not walled into one message.
    maxPerMessage: Number(process.env.JOBS_MAX_PER_MESSAGE || 40),
  },
  push: {
    // Real phone push notifications via ntfy.sh — a channel entirely outside
    // WhatsApp, since WhatsApp suppresses notifications for anything sent by
    // a linked device under your own account (self-chat *and* groups alike;
    // it's about who sent it, not which chat). No signup: pick a topic,
    // subscribe in the ntfy app, set it here. Empty topic = disabled.
    topic: process.env.NTFY_TOPIC || '',
    server: (process.env.NTFY_SERVER || 'https://ntfy.sh').replace(/\/+$/, ''),
  },
  web: {
    // Plain web dashboard for browsing saved items / reminders.
    enabled: bool(process.env.WEB_ENABLED, true),
    port: Number(process.env.WEB_PORT || 8080),
    user: process.env.WEB_USER || 'admin',
    // If empty, the dashboard binds to loopback only (never exposed unauthenticated).
    password: process.env.WEB_PASSWORD || '',
  },
  debug: bool(process.env.DEBUG, false),
};

export function assertRuntimeConfig() {
  const errors = [];
  if (config.llm.provider === 'openai' && !config.llm.openai.apiKey) {
    errors.push('LLM_PROVIDER=openai but OPENAI_API_KEY is empty');
  }
  if (config.llm.provider === 'gemini' && !config.llm.gemini.apiKey) {
    errors.push('LLM_PROVIDER=gemini but GEMINI_API_KEY is empty');
  }
  if (!['openai', 'gemini'].includes(config.llm.provider)) {
    errors.push(`Unknown LLM_PROVIDER "${config.llm.provider}" (use openai|gemini)`);
  }
  return errors;
}
