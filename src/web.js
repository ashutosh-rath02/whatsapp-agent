// A tiny, dependency-free web dashboard (Node's built-in http) showing your
// saved items and pending reminders. Deliberately plain / old-school: server
// rendered HTML, a sprinkle of CSS, no JavaScript.
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
  dbPath,
} from './store.js';
import { relTime, fmtAbsolute, escapeHtml } from './format.js';

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

const CSS = `
:root{--ink:#1a1a1a;--rule:#cfc8b8;--paper:#f6f3ea;--card:#fffdf7;--link:#0b3d91;--faint:#857c63;}
*{box-sizing:border-box}
body{max-width:760px;margin:32px auto;padding:0 18px;background:var(--paper);color:var(--ink);
  font:16px/1.55 Georgia,'Times New Roman',serif;}
header{border-bottom:3px double var(--ink);margin-bottom:6px;padding-bottom:6px;}
header h1{font-size:26px;margin:0;letter-spacing:.5px;}
header .sub{color:var(--faint);font-size:13px;font-style:italic;margin-top:2px;}
h2{font-size:14px;text-transform:uppercase;letter-spacing:1px;border-bottom:1px solid var(--rule);
  padding-bottom:4px;margin:28px 0 10px;}
.card{background:var(--card);border:1px solid var(--rule);padding:9px 12px;margin:8px 0;}
.card .body{margin:1px 0 4px;white-space:pre-wrap;word-wrap:break-word;}
.card .meta{font-size:12px;color:var(--faint);}
.card a{color:var(--link);text-decoration:none;word-break:break-all;}
.card a:hover{text-decoration:underline;}
.row{display:flex;justify-content:space-between;gap:10px;align-items:baseline;}
.id{font-weight:bold;color:var(--faint);font-size:13px;}
form{display:inline;margin:0;}
button{font:12px Georgia,serif;background:var(--paper);border:1px solid #b9b1a0;padding:1px 9px;
  cursor:pointer;color:#555;}
button:hover{background:#efe9da;}
.empty{color:var(--faint);font-style:italic;}
.tag{display:inline-block;background:#efe9da;border:1px solid var(--rule);padding:0 6px;
  font-size:11px;color:var(--faint);margin-left:6px;}
footer{margin-top:34px;border-top:1px solid var(--rule);padding-top:10px;font-size:12px;color:var(--faint);}
code{background:#efe9da;padding:1px 5px;font-size:13px;}
`;

function page(body) {
  return `<!doctype html><html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="refresh" content="60">
<title>whatsapp-agent</title>
<style>${CSS}</style></head>
<body>${body}</body></html>`;
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
  return `<div class="card">
  <div class="row"><span class="id">${escapeHtml(j.company)}</span>
    <span class="tag">${escapeHtml(j.fit)}</span></div>
  <div class="body"><a href="${escapeHtml(j.url)}" target="_blank" rel="noreferrer noopener">${escapeHtml(j.title)}</a></div>
  <div class="meta">${escapeHtml(j.location || '')}${j.location ? ' · ' : ''}${escapeHtml(fmtAbsolute(j.deliveredAt, tz))}</div>
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
  <h1>🗒️ whatsapp-agent</h1>
  <div class="sub">your saved links, notes, reminders &amp; job matches</div>
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
    <code>list</code> <code>find …</code> <code>done #id</code> <code>jobs</code></div>
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
