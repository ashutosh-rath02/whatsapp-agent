// Two dedicated "daily edition" pages on top of the same dashboard theme:
// /news browses past digests grouped by day and tier; /jobs browses
// delivered postings grouped by day. Both are server-rendered, no JS,
// day-by-day navigation via ?day=YYYY-MM-DD (a plain link, not a query form).
import { config } from './config.js';
import { recentNews, recentJobs } from './store.js';
import { TIERS } from './newsSources.js';
import { fmtAbsolute, escapeHtml } from './format.js';
import { page, navTabs, jobStatusBadge, jobStatusActions } from './webTheme.js';

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
  const dayItems = byDay.get(current) || [];

  // Safety cap per tier, same philosophy as the jobs page and the WhatsApp
  // message itself — a heavy news day shouldn't make the page unbounded.
  const RENDER_CAP_PER_TIER = 60;
  const byTier = {};
  let overflow = 0;
  for (const n of dayItems) {
    const bucket = (byTier[n.tier] ||= []);
    if (bucket.length < RENDER_CAP_PER_TIER) bucket.push(n);
    else overflow++;
  }
  const sections = Object.entries(TIERS)
    .filter(([tier]) => byTier[tier]?.length)
    .map(([tier, label]) => `<h3 class="section">${label}</h3>${byTier[tier].map(newsItemRow).join('')}`)
    .join('');

  const sourceCount = new Set(dayItems.map((n) => n.source)).size;
  const body = `
<header>
  <h1><a href="/">🗒️ whatsapp-agent</a></h1>
  <div class="sub">daily AI digest — every morning at ${escapeHtml(config.news.digestTime)} (${escapeHtml(tz || 'host time')})</div>
  ${navTabs('/news')}
</header>

${dayNav('/news', tz, { current, newer, older })}
<div class="stat-row"><span><strong>${dayItems.length}</strong> items</span><span><strong>${sourceCount}</strong> sources</span></div>
${sections}
${overflow > 0 ? `<div class="empty">+${overflow} more from this day, capped per section at ${RENDER_CAP_PER_TIER}.</div>` : ''}
${archiveStrip('/news', days, current)}

<footer>Send <code>news</code> in WhatsApp for an on-demand digest, or <code>news sources</code> to see everything watched.</footer>`;
  return page(body, `News — ${dayLabel(current, tz)}`);
}

// ── Jobs ─────────────────────────────────────────────────────────────────────

/** @param {boolean} showCompany false when already nested under that company's own accordion */
function jobItemRow(j, showCompany = true) {
  const fitClass = j.fit === 'Good fit' ? 'good' : 'stretch';
  const cardClass = j.status === 'not_applicable' ? ' skipped' : '';
  return `<div class="card${cardClass}">
  <div class="row"><span class="id">${showCompany ? escapeHtml(j.company) : ' '}</span>
    <span>${jobStatusBadge(j.status)}<span class="tag ${fitClass}">${escapeHtml(j.fit)}</span></span></div>
  <div class="body"><a href="${escapeHtml(j.url)}" target="_blank" rel="noreferrer noopener">${escapeHtml(j.title)}</a></div>
  ${j.location ? `<div class="meta">${escapeHtml(j.location)}</div>` : ''}
  ${jobStatusActions(j)}
</div>`;
}

function jobsViewToggle(active) {
  const tabs = [
    ['/jobs', '📅 By day', 'day'],
    ['/jobs?view=company', '🏢 By company', 'company'],
  ];
  return `<nav class="tabs sub-toggle">${tabs
    .map(([href, label, key], i) => `${i ? '<span class="sep">·</span>' : ''}<a href="${href}"${key === active ? ' class="active"' : ''}>${label}</a>`)
    .join('')}</nav>`;
}

function jobsEmptyPage(view) {
  const body = `<header><h1><a href="/">🗒️ whatsapp-agent</a></h1>${navTabs('/jobs')}</header>
<h2>💼 Jobs</h2>
${jobsViewToggle(view)}
<div class="empty">No matches delivered yet — the watcher polls every ~${Math.round(config.jobs.pollMs / 60000)} min, or send <code>jobs</code> in WhatsApp to trigger a poll now.</div>`;
  return page(body, 'Jobs — whatsapp-agent');
}

function companyAccordion(company, jobs) {
  const CAP = 30;
  const openCount = jobs.filter((j) => j.status === 'open').length;
  const shown = jobs.slice(0, CAP);
  const overflow = jobs.length - shown.length;
  const countLabel = `${jobs.length} role${jobs.length === 1 ? '' : 's'}${openCount < jobs.length ? ` · ${openCount} open` : ''}`;
  return `<details class="company">
  <summary><span class="company-name">${escapeHtml(company)}</span><span class="tag">${countLabel}</span></summary>
  <div class="company-body">
    ${shown.map((j) => jobItemRow(j, false)).join('')}
    ${overflow > 0 ? `<div class="empty">+${overflow} more from ${escapeHtml(company)} — narrowed to the most recent ${CAP}.</div>` : ''}
  </div>
</details>`;
}

function renderJobsByCompany() {
  const tz = config.agent.timezone;
  const all = recentJobs(5000); // across every day, not just one — the whole point of this view
  if (!all.length) return jobsEmptyPage('company');

  const byCompany = new Map();
  for (const j of all) {
    if (!byCompany.has(j.company)) byCompany.set(j.company, []);
    byCompany.get(j.company).push(j);
  }
  for (const list of byCompany.values()) list.sort((a, b) => b.deliveredAt - a.deliveredAt);

  const companies = [...byCompany.keys()].sort((a, b) => a.localeCompare(b));
  const COMPANY_CAP = 150;
  const shownCompanies = companies.slice(0, COMPANY_CAP);
  const companyOverflow = companies.length - shownCompanies.length;

  const body = `
<header>
  <h1><a href="/">🗒️ whatsapp-agent</a></h1>
  <div class="sub">real-time job watch — India-only — software / full-stack / backend / frontend / AI / forward-deployed engineer</div>
  ${navTabs('/jobs')}
</header>

${jobsViewToggle('company')}
<div class="stat-row"><span><strong>${all.length}</strong> postings</span><span><strong>${companies.length}</strong> companies</span></div>
${shownCompanies.map((c) => companyAccordion(c, byCompany.get(c))).join('')}
${companyOverflow > 0 ? `<div class="empty">+${companyOverflow} more companies not shown.</div>` : ''}

<footer>Click a company to expand it. Send <code>jobs</code> in WhatsApp to poll now, or <code>jobs sources</code> to see every company watched.</footer>`;
  return page(body, 'Jobs by company — whatsapp-agent');
}

export function renderJobsPage(query) {
  if (query.view === 'company') return renderJobsByCompany();

  const tz = config.agent.timezone;
  const all = recentJobs(3000);
  const byDay = groupByDay(all, 'deliveredAt', tz);
  const days = [...byDay.keys()];

  if (!days.length) return jobsEmptyPage('day');

  const { current, newer, older } = resolveDay(days, query.day);
  const dayItems = (byDay.get(current) || []).slice().sort((a, b) => a.company.localeCompare(b.company));
  const companyCount = new Set(dayItems.map((j) => j.company)).size;
  const goodFit = dayItems.filter((j) => j.fit === 'Good fit').length;
  const applied = dayItems.filter((j) => j.status === 'applied').length;

  // A day can hold hundreds of postings (a re-seed, or a big multi-city
  // posting spree from one company) — cap what actually renders so the
  // page stays a normal size, same philosophy as the WhatsApp message cap.
  const RENDER_CAP = 200;
  const items = dayItems.slice(0, RENDER_CAP);
  const overflow = dayItems.length - items.length;

  const body = `
<header>
  <h1><a href="/">🗒️ whatsapp-agent</a></h1>
  <div class="sub">real-time job watch — India-only — software / full-stack / backend / frontend / AI / forward-deployed engineer</div>
  ${navTabs('/jobs')}
</header>

${jobsViewToggle('day')}
${dayNav('/jobs', tz, { current, newer, older })}
<div class="stat-row"><span><strong>${dayItems.length}</strong> postings</span><span><strong>${companyCount}</strong> companies</span><span><strong>${goodFit}</strong> good fit</span><span><strong>${applied}</strong> applied</span></div>
${items.map((j) => jobItemRow(j, true)).join('')}
${overflow > 0 ? `<div class="empty">+${overflow} more from this day — narrowed to the first ${RENDER_CAP}, alphabetical by company.</div>` : ''}
${archiveStrip('/jobs', days, current)}

<footer>Send <code>jobs</code> in WhatsApp to poll now, or <code>jobs sources</code> to see every company watched.</footer>`;
  return page(body, `Jobs — ${dayLabel(current, tz)}`);
}
