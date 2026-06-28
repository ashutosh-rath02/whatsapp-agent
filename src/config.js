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
  },
  agent: {
    // Only act on self-chat messages whose plain text is at least this long
    // (links always trigger regardless of length).
    minTextLength: Number(process.env.MIN_TEXT_LENGTH || 12),
    // Marker prepended to the agent's own replies so it never processes them.
    replyMarker: '🔎 *Agent summary*',
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
