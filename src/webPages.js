// Two dedicated "daily edition" pages on top of the same dashboard theme:
// /news browses past digests grouped by day and tier; /jobs browses
// delivered postings grouped by day. Both are server-rendered, no JS,
// day-by-day navigation via ?day=YYYY-MM-DD (a plain link, not a query form).
import { config } from './config.js';
import { recentNews, recentJobs } from './store.js';
import { TIERS } from './newsSources.js';
import { fmtAbsolute, escapeHtml, trunc } from './format.js';
import { page, navTabs } from './webTheme.js';

function dayKey(ts, tz) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz || undefined, year: 'numeric', month: '2-digit', day: '2-digit' }).format(ts);
}

function dayLabel(key, tz) {
  const ts = new Date(`${key}T12:00:00`).getTime(); // noon avoids DST edge cases
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: tz || undefined,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(ts);
}

/** Group items (newest-first) into a Map<dayKey, items[]>, keys newest-first. */
function groupByDay(items, tsField, tz) {
  const map = new Map();
  for (const item of items) {
    const k = dayKey(item[tsField], tz);
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(item);
  }
  return map;
}

/** Shared "which day are we showing" resolution + prev/next day keys. */
function resolveDay(days, requested) {
  const idx = requested && days.includes(requested) ? days.indexOf(requested) : 0;
  return {
    current: days[idx] ?? null,
    // days[] is newest-first: a smaller index is newer.
    newer: idx > 0 ? days[idx - 1] : null,
    older: idx < days.length - 1 ? days[idx + 1] : null,
  };
}

function dayNav(basePath, tz, { current, newer, older }) {
  const older_ = older
    ? `<a href="${basePath}?day=${older}">← ${escapeHtml(dayLabel(older, tz).split(',')[0])}</a>`
    : '<span class="empty-side">—</span>';
  const newer_ = newer
    ? `<a href="${basePath}?day=${newer}">${escapeHtml(dayLabel(newer, tz).split(',')[0])} →</a>`
    : '<span class="empty-side">—</span>';
  return `<div class="daynav">${older_}<span>${current ? escapeHtml(dayLabel(current, tz)) : ''}</span>${newer_}</div>`;
}

function archiveStrip(basePath, days, current, limit = 10) {
  if (days.length <= 1) return '';
  const links = days
    .slice(0, limit)
    .map((d) => `<a href="${basePath}?day=${d}"${d === current ? ' class="current"' : ''}>${d.slice(5)}</a>`)
    .join('');
  return `<div class="archive"><strong>Recent editions:</strong> ${links}</div>`;
}

// ── News ─────────────────────────────────────────────────────────────────────

function newsItemRow(n) {
  return `<div class="card">
  <div class="row"><span class="id">${escapeHtml(n.sourceName)}</span>${n.star ? '<span class="tag star">★ starter</span>' : ''}</div>
  <div class="body"><a href="${escapeHtml(n.url)}" target="_blank" rel="noreferrer noopener">${escapeHtml(n.title)}</a></div>
</div>`;
}

export function renderNewsPage(query) {
  const tz = config.agent.timezone;
  const all = recentNews(2000);
  const byDay = groupByDay(all, 'digestedAt', tz);
  const days = [...byDay.keys()]; // Map preserves insertion order; `all` is already newest-first

  if (!days.length) {
    const body = `<header><h1><a href="/">🗒️ whatsapp-agent</a></h1>${navTabs('/news')}</header>
<h2>🗞️ News</h2>
<div class="empty">No digests delivered yet — the first runs at ${escapeHtml(config.news.digestTime)} (${escapeHtml(tz || 'host time')}), or send <code>news</code> in WhatsApp to trigger one now.</div>`;
    return page(body, 'News — whatsapp-agent');
  }

  const { current, newer, older } = resolveDay(days, query.day);
  const items = byDay.get(current) || [];

  const byTier = {};
  for (const n of items) (byTier[n.tier] ||= []).push(n);
  const sections = Object.entries(TIERS)
    .filter(([tier]) => byTier[tier]?.length)
    .map(([tier, label]) => `<h3 class="section">${label}</h3>${byTier[tier].map(newsItemRow).join('')}`)
    .join('');

  const sourceCount = new Set(items.map((n) => n.source)).size;
  const body = `
<header>
  <h1><a href="/">🗒️ whatsapp-agent</a></h1>
  <div class="sub">daily AI digest — every morning at ${escapeHtml(config.news.digestTime)} (${escapeHtml(tz || 'host time')})</div>
  ${navTabs('/news')}
</header>

${dayNav('/news', tz, { current, newer, older })}
<div class="stat-row"><span><strong>${items.length}</strong> items</span><span><strong>${sourceCount}</strong> sources</span></div>
${sections}
${archiveStrip('/news', days, current)}

<footer>Send <code>news</code> in WhatsApp for an on-demand digest, or <code>news sources</code> to see everything watched.</footer>`;
  return page(body, `News — ${dayLabel(current, tz)}`);
}

// ── Jobs ─────────────────────────────────────────────────────────────────────

function jobItemRow(j) {
  const fitClass = j.fit === 'Good fit' ? 'good' : 'stretch';
  return `<div class="card">
  <div class="row"><span class="id">${escapeHtml(j.company)}</span><span class="tag ${fitClass}">${escapeHtml(j.fit)}</span></div>
  <div class="body"><a href="${escapeHtml(j.url)}" target="_blank" rel="noreferrer noopener">${escapeHtml(j.title)}</a></div>
  ${j.location ? `<div class="meta">${escapeHtml(j.location)}</div>` : ''}
</div>`;
}

export function renderJobsPage(query) {
  const tz = config.agent.timezone;
  const all = recentJobs(3000);
  const byDay = groupByDay(all, 'deliveredAt', tz);
  const days = [...byDay.keys()];

  if (!days.length) {
    const body = `<header><h1><a href="/">🗒️ whatsapp-agent</a></h1>${navTabs('/jobs')}</header>
<h2>💼 Jobs</h2>
<div class="empty">No matches delivered yet — the watcher polls every ~${Math.round(config.jobs.pollMs / 60000)} min, or send <code>jobs</code> in WhatsApp to trigger a poll now.</div>`;
    return page(body, 'Jobs — whatsapp-agent');
  }

  const { current, newer, older } = resolveDay(days, query.day);
  const items = (byDay.get(current) || []).slice().sort((a, b) => a.company.localeCompare(b.company));
  const companyCount = new Set(items.map((j) => j.company)).size;
  const goodFit = items.filter((j) => j.fit === 'Good fit').length;

  const body = `
<header>
  <h1><a href="/">🗒️ whatsapp-agent</a></h1>
  <div class="sub">real-time job watch — ${trunc('software / full-stack / backend / frontend / AI / forward-deployed engineer', 90)}</div>
  ${navTabs('/jobs')}
</header>

${dayNav('/jobs', tz, { current, newer, older })}
<div class="stat-row"><span><strong>${items.length}</strong> postings</span><span><strong>${companyCount}</strong> companies</span><span><strong>${goodFit}</strong> good fit</span></div>
${items.map(jobItemRow).join('')}
${archiveStrip('/jobs', days, current)}

<footer>Send <code>jobs</code> in WhatsApp to poll now, or <code>jobs sources</code> to see every company watched.</footer>`;
  return page(body, `Jobs — ${dayLabel(current, tz)}`);
}
