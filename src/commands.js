// Parse the leading keyword of a self-chat message into an intent.
// Explicit keywords only (the user opted for deterministic, zero-cost routing):
// anything without a recognised keyword falls through to research (the default).
import * as chrono from 'chrono-node';

const ALIASES = {
  save: 'save', store: 'save', keep: 'save',
  ask: 'research', research: 'research', explore: 'research',
  remind: 'remind', reminder: 'remind', remindme: 'remind',
  list: 'list', recent: 'list', ls: 'list', all: 'list',
  find: 'find', search: 'find',
  done: 'done', delete: 'done', del: 'done', rm: 'done', clear: 'done',
  cancel: 'cancel',
  help: 'help', commands: 'help', menu: 'help',
};

/**
 * @returns {{ name: string, arg: string, explicit: boolean, keyword?: string }}
 *   name is one of the canonical intents; for non-commands name='research'.
 */
export function parseCommand(body = '') {
  const text = body.trim();
  const firstTok = text.split(/\s+/, 1)[0] || '';
  const key = firstTok.toLowerCase().replace(/[:：,.!]+$/, '');
  const name = ALIASES[key];
  if (!name) return { name: 'research', arg: text, explicit: false };
  return { name, arg: text.slice(firstTok.length).trim(), explicit: true, keyword: key };
}

// Expand casual durations chrono doesn't natively read ("2h", "30m", "tmrw").
const DURATIONS = [
  [/\btmrw\b|\btmr\b/gi, 'tomorrow'],
  [/\b(\d+)\s*hrs?\b/gi, '$1 hours'],
  [/\b(\d+)\s*h\b/gi, '$1 hours'],
  [/\b(\d+)\s*mins?\b/gi, '$1 minutes'],
  [/\b(\d+)\s*m\b/gi, '$1 minutes'],
  [/\b(\d+)\s*d\b/gi, '$1 days'],
  [/\b(\d+)\s*wks?\b/gi, '$1 weeks'],
  [/\b(\d+)\s*w\b/gi, '$1 weeks'],
];

function normalize(s) {
  let out = s;
  for (const [re, rep] of DURATIONS) out = out.replace(re, rep);
  return out;
}

// A "time: note" separator is a colon followed by a space (or end) — this
// distinguishes "9am: do X" (separator) from "9:30am" (clock) and "http://".
function findSeparator(s) {
  for (let i = 0; i < s.length; i++) {
    if (s[i] === ':' && (i === s.length - 1 || s[i + 1] === ' ')) return i;
  }
  return -1;
}

/**
 * Parse a reminder argument into a due time + note.
 * Accepts "me in 2h: ping Sam", "tomorrow 9am: review PR", "in 30m grab coffee".
 * @returns {{ ok: true, dueAt: number, content: string } | { ok: false, reason: string }}
 */
export function parseReminder(arg, ref = new Date()) {
  const s = String(arg || '')
    .trim()
    .replace(/^me\b[\s,]*/i, '')
    .trim();
  if (!s) return { ok: false, reason: 'tell me when — e.g. "in 2h: call mom"' };

  const sep = findSeparator(s);
  if (sep >= 0) {
    const timePhrase = s.slice(0, sep).trim();
    const content = s.slice(sep + 1).trim();
    const r = chrono.parse(normalize(timePhrase), ref, { forwardDate: true })[0];
    if (!r) return { ok: false, reason: `couldn't read the time "${timePhrase}"` };
    return { ok: true, dueAt: r.start.date().getTime(), content };
  }

  // No "time: note" colon — parse the whole thing; the leftover text is the note.
  const norm = normalize(s);
  const r = chrono.parse(norm, ref, { forwardDate: true })[0];
  if (!r) return { ok: false, reason: `couldn't find a time in "${s}"` };
  const content = (norm.slice(0, r.index) + norm.slice(r.index + r.text.length))
    .replace(/^[\s:,–-]+|[\s:,–-]+$/g, '')
    .trim();
  return { ok: true, dueAt: r.start.date().getTime(), content };
}
