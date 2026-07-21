// A tiny, dependency-free web dashboard (Node's built-in http) showing your
// saved items and pending reminders. Deliberately plain / old-school: server
// rendered HTML, a sprinkle of CSS, and one small scoped script for the job
// status buttons (see webTheme.js's STATUS_SCRIPT) — everything else is JS-free.
//
// Security: if WEB_PASSWORD is set, the server binds to all interfaces and
// requires HTTP Basic auth. If it's NOT set, it binds to loopback only
// (127.0.0.1) so an unauthenticated dashboard is never exposed on a public IP.
import http from 'node:http';
import crypto from 'node:crypto';
import { config } from './config.js';
import { log } from './logger.js';
import {
  listItems,
  pendingReminders,
  removeItem,
  cancelReminder,
  recentJobs,
  setJobStatus,
  dbPath,
} from './store.js';
import { relTime, fmtAbsolute, escapeHtml } from './format.js';
import { page, navTabs, jobStatusBadge, jobStatusActions } from './webTheme.js';
import { renderNewsPage, renderJobsPage } from './webPages.js';

function safeEqual(a, b) {
  const ab = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

function authed(req) {
  if (!config.web.password) return true;
  const header = req.headers.authorization || '';
  const [scheme, b64] = header.split(' ');
  if (scheme !== 'Basic' || !b64) return false;
  const decoded = Buffer.from(b64, 'base64').toString('utf8');
  const i = decoded.indexOf(':');
  const user = decoded.slice(0, i);
  const pass = decoded.slice(i + 1);
  return safeEqual(user, config.web.user) && safeEqual(pass, config.web.password);
}

const send = (res, code, body, type = 'text/html; charset=utf-8') => {
  res.writeHead(code, { 'content-type': type });
  res.end(body);
};
const redirect = (res, to) => {
  res.writeHead(303, { location: to });
  res.end();
};

// Where a job-status button should send you back to — same page you clicked
// from (day and all), not always the homepage, so triaging a whole day's
// list doesn't reset your place after every click.
function refererPath(req) {
  try {
    const u = new URL(req.headers.referer, 'http://localhost');
    return u.pathname.startsWith('/jobs') ? `${u.pathname}${u.search}` : null;
  } catch {
    return null;
  }
}

function reminderCard(r, tz) {
  return `<div class="card">
  <div class="row"><span class="id">R${r.id}</span>
    <form method="post" action="/reminders/${r.id}/cancel"><button>cancel</button></form></div>
  <div class="body">${escapeHtml(r.content || '(no note)')}</div>
  <div class="meta">${escapeHtml(relTime(r.dueAt))} · ${escapeHtml(fmtAbsolute(r.dueAt, tz))}</div>
</div>`;
}

function itemCard(i, tz) {
  const body = i.content || '';
  const showUrl = i.url && i.url !== body.trim();
  const link = showUrl
    ? `<div><a href="${escapeHtml(i.url)}" target="_blank" rel="noreferrer noopener">${escapeHtml(i.url)}</a></div>`
    : '';
  return `<div class="card">
  <div class="row"><span class="id">#${i.id}</span>
    <form method="post" action="/items/${i.id}/done"><button>done</button></form></div>
  <div class="body">${escapeHtml(body)}</div>
  ${link}
  <div class="meta">${escapeHtml(fmtAbsolute(i.createdAt, tz))}</div>
</div>`;
}

function jobCard(j, tz) {
  const fitClass = j.fit === 'Good fit' ? 'good' : 'stretch';
  const cardClass = j.status === 'not_applicable' ? ' skipped' : '';
  return `<div class="card${cardClass}" data-job-id="${j.id}">
  <div class="row"><span class="id">${escapeHtml(j.company)}</span>
    <span class="badges">${jobStatusBadge(j.status)}<span class="tag ${fitClass}">${escapeHtml(j.fit)}</span></span></div>
  <div class="body"><a href="${escapeHtml(j.url)}" target="_blank" rel="noreferrer noopener">${escapeHtml(j.title)}</a></div>
  <div class="meta">${escapeHtml(j.location || '')}${j.location ? ' · ' : ''}${escapeHtml(fmtAbsolute(j.deliveredAt, tz))}</div>
  ${jobStatusActions(j)}
</div>`;
}

export function renderDashboard() {
  const tz = config.agent.timezone;
  const items = listItems(500);
  const rem = pendingReminders(500);
  const jobs = recentJobs(100);

  const remSection = rem.length
    ? rem.map((r) => reminderCard(r, tz)).join('')
    : '<div class="empty">No reminders. Send <code>remind me in 1h: …</code></div>';

  const itemSection = items.length
    ? items.map((i) => itemCard(i, tz)).join('')
    : '<div class="empty">Nothing saved. Send <code>save &lt;link or note&gt;</code></div>';

  const jobSection = jobs.length
    ? jobs.map((j) => jobCard(j, tz)).join('')
    : '<div class="empty">No job matches delivered yet.</div>';

  const body = `
<header>
  <h1><a href="/">🗒️ whatsapp-agent</a></h1>
  <div class="sub">your saved links, notes, reminders &amp; job matches</div>
  ${navTabs('/')}
</header>

<h2>⏰ Reminders <span class="tag">${rem.length}</span></h2>
${remSection}

<h2>📌 Saved <span class="tag">${items.length}</span></h2>
${itemSection}

<h2>💼 Recent jobs <span class="tag">${jobs.length}</span></h2>
${jobSection}

<footer>
  <div><strong>Send in WhatsApp:</strong>
    <code>save …</code> <code>ask …</code> <code>remind me in 2h: …</code>
    <code>list</code> <code>find …</code> <code>done #id</code> <code>jobs</code> <code>news</code></div>
  <div style="margin-top:6px">${items.length} saved · ${rem.length} reminders · ${jobs.length} jobs shown · data <code>${escapeHtml(dbPath())}</code></div>
</footer>`;
  return page(body);
}

export function startWebServer() {
  const host = process.env.WEB_HOST || (config.web.password ? '0.0.0.0' : '127.0.0.1');
  const port = config.web.port;

  const server = http.createServer((req, res) => {
    let url;
    try {
      url = new URL(req.url, 'http://localhost');
    } catch {
      return send(res, 400, 'Bad request', 'text/plain');
    }
    const p = url.pathname;

    // Health check stays open (for load balancers / uptime monitors).
    if (p === '/health') return send(res, 200, 'ok', 'text/plain');

    if (config.web.password && !authed(req)) {
      res.writeHead(401, { 'WWW-Authenticate': 'Basic realm="whatsapp-agent"' });
      return res.end('Authentication required');
    }

    let m;
    if (req.method === 'GET' && p === '/') return send(res, 200, renderDashboard());
    if (req.method === 'GET' && p === '/news')
      return send(res, 200, renderNewsPage(Object.fromEntries(url.searchParams)));
    if (req.method === 'GET' && p === '/jobs')
      return send(res, 200, renderJobsPage(Object.fromEntries(url.searchParams)));
    if (req.method === 'GET' && p === '/api/items')
      return send(res, 200, JSON.stringify(listItems(500)), 'application/json');
    if (req.method === 'GET' && p === '/api/reminders')
      return send(res, 200, JSON.stringify(pendingReminders(500)), 'application/json');
    if (req.method === 'GET' && p === '/api/jobs')
      return send(res, 200, JSON.stringify(recentJobs(500)), 'application/json');
    if (req.method === 'POST' && (m = p.match(/^\/items\/(\d+)\/done$/))) {
      removeItem(Number(m[1]));
      return redirect(res, '/');
    }
    if (req.method === 'POST' && (m = p.match(/^\/reminders\/(\d+)\/cancel$/))) {
      cancelReminder(Number(m[1]));
      return redirect(res, '/');
    }
    if (req.method === 'POST' && (m = p.match(/^\/jobs\/(\d+)\/(applied|skip|open)$/))) {
      const status = { applied: 'applied', skip: 'not_applicable', open: 'open' }[m[2]];
      setJobStatus(Number(m[1]), status);
      return redirect(res, refererPath(req) || '/'); // preserves e.g. /jobs?day=... instead of always bouncing home
    }
    return send(res, 404, 'Not found', 'text/plain');
  });

  server.on('error', (e) => log.error('web server error:', e?.message));
  server.listen(port, host, () => {
    const shown = host === '127.0.0.1' ? 'http://127.0.0.1' : 'http://<your-server-ip>';
    log.info(`🌐 dashboard → ${shown}:${port}`);
    if (!config.web.password) {
      log.warn('dashboard is loopback-only & unauthenticated — set WEB_PASSWORD to expose it on your server IP');
    }
  });

  return { server, stop: () => new Promise((resolve) => server.close(resolve)) };
}
