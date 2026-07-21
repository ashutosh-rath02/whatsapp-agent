// The news/watch engine: polls the source catalog, dedupes into the store,
// builds the WhatsApp digest, and schedules the every-morning delivery.
//
// Design: one fetch burst per digest (not a continuous poller). Feeds carry
// their last ~20 items, so a daily pull misses nothing, and the store's seen
// set guarantees an item is only ever reported once.
import { config } from './config.js';
import { log } from './logger.js';
import { parseFeed } from './feeds.js';
import { fetchText, decodeEntities } from './html.js';
import { enabledSources, TIERS } from './newsSources.js';
import { addNews, pendingNews, markNewsDigested, getMeta, setMeta, reload } from './store.js';
import { sendPush } from './push.js';
import { complete } from './llm/index.js';
import { trunc } from './format.js';

// Short stable hash for dedup keys (djb2).
function hash(s = '') {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

// ── Per-kind fetchers ────────────────────────────────────────────────────────

async function fetchRss(source) {
  const res = await fetchText(source.url, { timeout: 12000 });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return parseFeed(res.text, 15);
}

/** Generic link scrape: anchors matching linkRe become items (title = anchor text). */
async function fetchScrape(source) {
  const res = await fetchText(source.url, { timeout: 15000 });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const items = [];
  const seen = new Set();
  const re = new RegExp(`<a[^>]*${source.linkRe}[^>]*>([\\s\\S]*?)</a>`, 'gi');
  let m;
  while ((m = re.exec(res.text)) && items.length < 10) {
    const path = m[1];
    if (seen.has(path)) continue;
    // Cards wrap category/date/blurb in the anchor too — a heading inside it
    // is the clean title. Only claim the path once we have a usable title:
    // the same article often has several anchors (thumbnail first, untitled).
    const inner = m[2];
    const heading = inner.match(/<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>/i);
    const title = decodeEntities((heading ? heading[1] : inner).replace(/<[^>]+>/g, ' '))
      .replace(/\s+/g, ' ')
      .trim();
    if (!title || title.length < 8) continue; // nav/thumbnail links, "Read more", etc.
    seen.add(path);
    items.push({ id: path, title, url: `${source.base}${path}`, ts: null });
  }
  return items;
}

/** Hacker News via the official Algolia API (hnrss.org is dead). */
async function fetchHn(source) {
  const byId = new Map();
  for (const q of source.queries) {
    const u = `${source.url}?query=${encodeURIComponent(q)}&tags=story&numericFilters=points>${source.minPoints}&hitsPerPage=10`;
    const res = await fetchText(u, { timeout: 10000 });
    if (!res.ok) continue;
    for (const hit of JSON.parse(res.text).hits || []) {
      if (!hit.title) continue;
      byId.set(hit.objectID, {
        id: hit.objectID,
        title: `${hit.title} (${hit.points}⇧)`,
        url: hit.url || `https://news.ycombinator.com/item?id=${hit.objectID}`,
        ts: hit.created_at ? Date.parse(hit.created_at) : null,
      });
    }
  }
  return [...byId.values()].sort((a, b) => (b.ts || 0) - (a.ts || 0)).slice(0, 10);
}

const FETCHERS = { rss: fetchRss, scrape: fetchScrape, hn: fetchHn };

// ── Collection ───────────────────────────────────────────────────────────────

/**
 * Poll every enabled source; store items we haven't seen before.
 * @returns {Promise<{ added: number, polled: number, failed: string[] }>}
 */
export async function collectNews() {
  reload(); // pick up any writes made by another process (e.g. a --seed run) since our last cycle
  const sources = enabledSources();
  const cutoff = Date.now() - config.news.maxAgeDays * 86_400_000;
  const failed = [];
  let added = 0;

  // Concurrency-limited fan-out: 6 at a time keeps a 40-source burst polite.
  const queue = [...sources];
  async function worker() {
    for (let src = queue.shift(); src; src = queue.shift()) {
      try {
        const raw = await FETCHERS[src.kind](src);
        // Items with a date must be recent; undated items (scrapes) pass —
        // dedup makes reprocessing them free after the first sighting.
        const fresh = raw.filter((it) => it.ts === null || it.ts >= cutoff);
        const stored = addNews(
          fresh.map((it) => ({
            key: `${src.id}:${hash(it.id || it.url)}`,
            source: src.id,
            sourceName: src.name,
            tier: src.tier,
            star: !!src.star,
            title: trunc(it.title, 110),
            url: it.url,
            ts: it.ts,
          })),
        );
        added += stored.length;
        log.debug(`news: ${src.id} → ${raw.length} items, ${stored.length} new`);
      } catch (e) {
        failed.push(src.id);
        log.debug(`news: ${src.id} failed — ${e?.message}`);
      }
    }
  }
  await Promise.all(Array.from({ length: 6 }, worker));

  log.info(`🗞️ collected: ${added} new item(s) from ${sources.length} sources${failed.length ? ` (${failed.length} failed: ${failed.join(', ')})` : ''}`);
  return { added, polled: sources.length, failed };
}

// ── Digest building ──────────────────────────────────────────────────────────

/** Ask the LLM to flag the 3–5 most significant headlines. Best-effort. */
async function llmPicks(items) {
  try {
    const list = items.map((n, i) => `${i + 1}. [${n.sourceName}] ${n.title}`).join('\n');
    const reply = await complete({
      system:
        'You pick the most significant AI-development headlines for a software engineer who builds ' +
        'LLM agents. Reply with 3-5 lines, each "N. one-sentence why it matters", N being the item number. ' +
        'Prefer: model releases, agent tooling/protocol changes, big capability or eval results. No preamble.',
      user: list,
    });
    const picks = [];
    for (const line of reply.split('\n')) {
      const m = line.match(/^\s*(\d+)[.)]\s*(.+)/);
      if (!m) continue;
      const n = items[Number(m[1]) - 1];
      if (n) picks.push(`⭐ ${n.title}\n   _${trunc(m[2].trim(), 120)}_\n   ${n.url}`);
      if (picks.length >= 5) break;
    }
    return picks.length ? `*Top picks*\n${picks.join('\n')}\n\n` : '';
  } catch (e) {
    log.debug('news: llm picks skipped —', e?.message);
    return '';
  }
}

/**
 * Format pending items into a WhatsApp digest.
 * @returns {Promise<{ text: string, keys: string[] } | null>} null when nothing new
 */
export async function buildDigest() {
  const pending = pendingNews();
  if (!pending.length) return null;

  // Newest first inside each source; starred sources get more slots.
  pending.sort((a, b) => (b.ts || b.seenAt) - (a.ts || a.seenAt));
  const perSource = {};
  const chosen = [];
  for (const n of pending) {
    const cap = n.star ? 3 : 2;
    perSource[n.source] = (perSource[n.source] || 0) + 1;
    if (perSource[n.source] <= cap) chosen.push(n);
    if (chosen.length >= config.news.maxItems) break;
  }

  const day = new Date().toLocaleDateString('en-GB', {
    weekday: 'short', day: 'numeric', month: 'short',
    timeZone: config.agent.timezone || undefined,
  });
  const head = `🗞️ *AI digest — ${day}*\n_${pending.length} new item(s) across ${new Set(pending.map((n) => n.source)).size} sources_\n\n`;

  const picks = config.news.llmPicks && chosen.length >= 8 ? await llmPicks(chosen.slice(0, 25)) : '';

  const byTier = {};
  for (const n of chosen) (byTier[n.tier] ||= []).push(n);
  const sections = [];
  for (const [tier, label] of Object.entries(TIERS)) {
    const rows = byTier[tier];
    if (!rows?.length) continue;
    sections.push(`*${label}*\n${rows.map((n) => `• ${n.sourceName}: ${n.title}\n  ${n.url}`).join('\n')}`);
  }

  const skipped = pending.length - chosen.length;
  const tail = skipped > 0 ? `\n\n_+${skipped} more (capped for readability)_` : '';
  // Everything pending is settled by this digest — shown or capped out.
  return { text: head + picks + sections.join('\n\n') + tail, keys: pending.map((n) => n.key) };
}

/** Collect + build + mark. Shared by the scheduler and the `news` command. */
export async function runDigest() {
  await collectNews();
  const digest = await buildDigest();
  if (!digest) return null;
  return {
    text: digest.text,
    count: digest.keys.length,
    commit: () => markNewsDigested(digest.keys), // call only after a successful send
  };
}

// ── Morning scheduler ────────────────────────────────────────────────────────

function nowInTz(tz) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz || undefined,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(new Date());
  const get = (t) => parts.find((p) => p.type === t)?.value || '00';
  return { ymd: `${get('year')}-${get('month')}-${get('day')}`, hm: `${get('hour')}:${get('minute')}` };
}

export function startNewsScheduler(client, getNotifyTarget) {
  let stopped = false;
  let running = false;
  let timer = null;

  async function tick() {
    if (stopped) return;
    try {
      const { ymd, hm } = nowInTz(config.agent.timezone);
      const due = hm >= config.news.digestTime && getMeta('news_last_digest_day') !== ymd;
      if (due && !running) {
        const chatId = getNotifyTarget();
        if (!chatId) {
          log.warn('news: digest due but self-chat id unknown yet — will retry');
        } else {
          running = true;
          log.info('🗞️ morning digest starting…');
          const digest = await runDigest();
          if (digest) {
            await client.sendMessage(chatId, `${config.agent.replyMarker}\n\n${digest.text}`);
            digest.commit();
            await sendPush('AI Digest', `${digest.count} new item(s) — open WhatsApp for the full rundown`, { tags: ['newspaper'] });
            log.info('🗞️ morning digest delivered');
          } else {
            log.info('🗞️ nothing new today — no digest sent');
          }
          setMeta('news_last_digest_day', ymd); // after success: a failed run retries next tick
          running = false;
        }
      }
    } catch (e) {
      running = false;
      log.error('news scheduler tick failed:', e?.message);
    } finally {
      if (!stopped) timer = setTimeout(tick, 60_000);
    }
  }

  timer = setTimeout(tick, 10_000);
  log.info(`🗞️ news digest scheduled daily at ${config.news.digestTime} (${config.agent.timezone || 'host tz'})`);
  return () => {
    stopped = true;
    if (timer) clearTimeout(timer);
  };
}
