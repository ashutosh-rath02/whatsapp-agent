// Tiny JSON-file datastore for saved items, reminders, and a small key/value
// meta table. Deliberately dependency-free (no native DB): a single process at
// personal volume, so synchronous reads/writes with an atomic rename are plenty.
//
// Lives on the persistent /data volume alongside the WhatsApp session, so it
// survives container restarts and redeploys.
import fs from 'node:fs';
import path from 'node:path';

const AUTH_PATH = process.env.WWEBJS_AUTH_PATH || '.wwebjs_auth';
// Default next to the session (its parent dir): /data in Docker, cwd locally.
const DATA_DIR = process.env.DATA_DIR || path.dirname(path.resolve(AUTH_PATH));
const DB_PATH = process.env.DB_PATH || path.join(DATA_DIR, 'agent-data.json');

const EMPTY = () => ({ items: [], reminders: [], meta: {}, seq: { item: 0, reminder: 0 } });

let state = null;

function load() {
  if (state) return state;
  try {
    state = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
  } catch {
    state = EMPTY();
  }
  // Be tolerant of an older/partial file shape.
  state.items ||= [];
  state.reminders ||= [];
  state.meta ||= {};
  state.seq ||= { item: 0, reminder: 0 };
  return state;
}

function persist() {
  const s = load();
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  const tmp = `${DB_PATH}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(s, null, 2));
  fs.renameSync(tmp, DB_PATH); // atomic replace
}

export function dbPath() {
  return DB_PATH;
}

// ── Saved items ──────────────────────────────────────────────────────────────

export function saveItem({ msgId, content, url = null, title = null, tags = [] }) {
  const s = load();
  if (msgId) {
    const dup = s.items.find((i) => i.msgId === msgId);
    if (dup) return { item: dup, duplicate: true };
  }
  const item = {
    id: ++s.seq.item,
    msgId: msgId || null,
    content,
    url,
    title,
    tags,
    status: 'open',
    createdAt: Date.now(),
  };
  s.items.push(item);
  persist();
  return { item, duplicate: false };
}

export function listItems(limit = 20) {
  return load()
    .items.filter((i) => i.status === 'open')
    .sort((a, b) => b.id - a.id)
    .slice(0, limit);
}

export function findItems(query, limit = 20) {
  const needle = String(query).toLowerCase();
  return load()
    .items.filter(
      (i) =>
        i.status === 'open' &&
        [i.content, i.title, i.url, (i.tags || []).join(' ')]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
          .includes(needle),
    )
    .sort((a, b) => b.id - a.id)
    .slice(0, limit);
}

export function removeItem(id) {
  const s = load();
  const it = s.items.find((i) => i.id === id && i.status === 'open');
  if (!it) return false;
  it.status = 'done';
  it.doneAt = Date.now();
  persist();
  return true;
}

// ── Reminders ────────────────────────────────────────────────────────────────

export function addReminder({ msgId, content, dueAt }) {
  const s = load();
  if (msgId) {
    const dup = s.reminders.find((r) => r.msgId === msgId);
    if (dup) return { reminder: dup, duplicate: true };
  }
  const reminder = {
    id: ++s.seq.reminder,
    msgId: msgId || null,
    content,
    dueAt,
    fired: false,
    createdAt: Date.now(),
  };
  s.reminders.push(reminder);
  persist();
  return { reminder, duplicate: false };
}

export function dueReminders(now = Date.now()) {
  return load()
    .reminders.filter((r) => !r.fired && r.dueAt <= now)
    .sort((a, b) => a.dueAt - b.dueAt);
}

export function pendingReminders(limit = 20) {
  return load()
    .reminders.filter((r) => !r.fired)
    .sort((a, b) => a.dueAt - b.dueAt)
    .slice(0, limit);
}

export function markReminderFired(id) {
  const s = load();
  const r = s.reminders.find((x) => x.id === id);
  if (r) {
    r.fired = true;
    r.firedAt = Date.now();
    persist();
  }
}

export function cancelReminder(id) {
  const s = load();
  const r = s.reminders.find((x) => x.id === id && !x.fired);
  if (!r) return false;
  r.fired = true;
  r.cancelled = true;
  r.firedAt = Date.now();
  persist();
  return true;
}

// ── Meta (key/value) ─────────────────────────────────────────────────────────

export function getMeta(key) {
  return load().meta[key] ?? null;
}

export function setMeta(key, value) {
  const s = load();
  if (s.meta[key] === value) return;
  s.meta[key] = value;
  persist();
}
