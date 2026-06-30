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
