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

const EMPTY = () => ({ items: [], reminders: [], news: [], jobs: [], meta: {}, seq: { item: 0, reminder: 0 } });

let state = null;

/**
 * Drop the in-memory cache so the next load() re-reads from disk.
 *
 * Why this exists: state is cached for the life of the process (cheap reads
 * during a call burst, e.g. ~123 addJobs() calls in one poll cycle). That
 * cache goes stale the moment a *second* process touches the same file —
 * which happened for real: a `--seed` run (its own short-lived process)
 * wrote 1180 pre-delivered jobs to disk, but the already-running main
 * process had cached an earlier, seed-unaware snapshot at startup. Its next
 * scheduled persist() overwrote the seed's write entirely, and every
 * "already seeded" job looked new again. Call reload() at the top of every
 * scheduler tick so each cycle starts from what's actually on disk, not
 * from a snapshot that predates it.
 */
export function reload() {
  state = null;
}

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
  state.news ||= [];
  state.jobs ||= [];
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

// ── News items (watch feature) ───────────────────────────────────────────────
// The `key` (source id + content hash) is the dedup identity: an item enters
// the store once, gets digested once, and is never re-reported.

export function addNews(items) {
  const s = load();
  const seen = new Set(s.news.map((n) => n.key));
  const added = [];
  for (const it of items) {
    if (!it.key || seen.has(it.key)) continue;
    seen.add(it.key);
    const entry = { ...it, seenAt: Date.now(), digestedAt: null };
    s.news.push(entry);
    added.push(entry);
  }
  if (added.length) {
    // Prune: keep the newest ~3000 digested entries (never drop undigested).
    if (s.news.length > 4000) {
      const keep = s.news.filter((n) => !n.digestedAt);
      const digested = s.news.filter((n) => n.digestedAt).sort((a, b) => b.seenAt - a.seenAt);
      s.news = [...keep, ...digested.slice(0, 3000 - keep.length)];
    }
    persist();
  }
  return added;
}

export function pendingNews() {
  return load().news.filter((n) => !n.digestedAt);
}

export function markNewsDigested(keys) {
  const s = load();
  const set = new Set(keys);
  let hit = false;
  for (const n of s.news) {
    if (set.has(n.key) && !n.digestedAt) {
      n.digestedAt = Date.now();
      hit = true;
    }
  }
  if (hit) persist();
}

export function recentNews(limit = 1000) {
  return load()
    .news.filter((n) => n.digestedAt)
    .sort((a, b) => b.digestedAt - a.digestedAt)
    .slice(0, limit);
}

export function newsCountBySource() {
  const out = {};
  for (const n of load().news) out[n.source] = (out[n.source] || 0) + 1;
  return out;
}

// ── Job postings (job-watch feature) ─────────────────────────────────────────
// Same shape as news: `key` (company + posting id) is the dedup identity, so
// a posting is only ever delivered once, even across restarts.

export function addJobs(items) {
  const s = load();
  const seen = new Set(s.jobs.map((j) => j.key));
  const added = [];
  for (const it of items) {
    if (!it.key || seen.has(it.key)) continue;
    seen.add(it.key);
    const entry = { ...it, seenAt: Date.now(), deliveredAt: null };
    s.jobs.push(entry);
    added.push(entry);
  }
  if (added.length) {
    if (s.jobs.length > 6000) {
      const keep = s.jobs.filter((j) => !j.deliveredAt);
      const delivered = s.jobs.filter((j) => j.deliveredAt).sort((a, b) => b.seenAt - a.seenAt);
      s.jobs = [...keep, ...delivered.slice(0, 5000 - keep.length)];
    }
    persist();
  }
  return added;
}

export function pendingJobs() {
  return load().jobs.filter((j) => !j.deliveredAt);
}

export function recentJobs(limit = 100) {
  return load()
    .jobs.filter((j) => j.deliveredAt)
    .sort((a, b) => b.deliveredAt - a.deliveredAt)
    .slice(0, limit);
}

export function markJobsDelivered(keys) {
  const s = load();
  const set = new Set(keys);
  let hit = false;
  for (const j of s.jobs) {
    if (set.has(j.key) && !j.deliveredAt) {
      j.deliveredAt = Date.now();
      hit = true;
    }
  }
  if (hit) persist();
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
