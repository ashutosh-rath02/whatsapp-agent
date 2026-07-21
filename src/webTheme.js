// Shared look for every dashboard page (/, /news, /jobs): an "old-school
// newspaper" theme — Georgia serif, warm paper background, double-rule
// mastheads and datelines — with a dark-mode variant via CSS custom
// properties. Almost no JS; a page auto-refreshes every 60s. The one
// exception is STATUS_SCRIPT below, for the job-status triage buttons.
export const CSS = `
:root{
  --ink:#1a1a1a;--rule:#cfc8b8;--paper:#f6f3ea;--card:#fffdf7;--link:#0b3d91;--faint:#857c63;
  --accent:#8a2e2e;--good:#2f6b3e;--good-bg:#e8f0e6;--stretch:#8a5a12;--stretch-bg:#f3e9d6;
  --applied:#1a5c8a;--applied-bg:#e3edf5;--skipped:#786e5c;--skipped-bg:#eae5d8;
  --shadow:0 1px 2px rgba(26,20,10,.05),0 1px 1px rgba(26,20,10,.04);
}
@media (prefers-color-scheme: dark){
  :root{--ink:#ece6d8;--rule:#3d372c;--paper:#17150f;--card:#211e17;--link:#7fa8e6;--faint:#948a72;
    --accent:#d98a8a;--good:#8fd19e;--good-bg:#1c2b1f;--stretch:#e0b876;--stretch-bg:#2b2318;
    --applied:#8ab6d9;--applied-bg:#182530;--skipped:#a89d87;--skipped-bg:#2a271f;
    --shadow:0 1px 2px rgba(0,0,0,.35),0 1px 1px rgba(0,0,0,.3);}
}
*{box-sizing:border-box}
body{max-width:760px;margin:32px auto;padding:0 18px;background:var(--paper);color:var(--ink);
  font:16px/1.55 Georgia,'Times New Roman',serif;}
header{border-bottom:3px double var(--ink);margin-bottom:10px;padding-bottom:8px;}
header h1{font-size:26px;margin:0;letter-spacing:.5px;}
header h1 a{color:inherit;text-decoration:none;}
header .sub{color:var(--faint);font-size:13px;font-style:italic;margin-top:2px;}
nav.tabs{margin-top:10px;font-size:12px;text-transform:uppercase;letter-spacing:1.2px;}
nav.tabs a{color:var(--faint);text-decoration:none;padding-bottom:2px;}
nav.tabs a.active{color:var(--ink);border-bottom:2px solid var(--accent);font-weight:bold;}
nav.tabs .sep{color:var(--rule);margin:0 10px;}
h2{font-size:14px;text-transform:uppercase;letter-spacing:1px;border-bottom:1px solid var(--rule);
  padding-bottom:4px;margin:28px 0 10px;}
h3.section{font-size:13px;text-transform:uppercase;letter-spacing:.8px;color:var(--faint);
  margin:20px 0 8px;display:flex;align-items:center;gap:8px;}
h3.section::after{content:'';flex:1;height:1px;background:var(--rule);}
.card{background:var(--card);border:1px solid var(--rule);border-radius:2px;box-shadow:var(--shadow);
  padding:10px 13px;margin:8px 0;}
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
.empty{color:var(--faint);font-style:italic;padding:6px 2px;}
.tag{display:inline-block;background:#efe9da;border:1px solid var(--rule);padding:0 6px;
  border-radius:2px;font-size:11px;color:var(--faint);margin-left:6px;white-space:nowrap;}
@media (prefers-color-scheme: dark){.tag{background:#2a2619;}}
.tag.good{background:var(--good-bg);border-color:var(--good);color:var(--good);}
.tag.stretch{background:var(--stretch-bg);border-color:var(--stretch);color:var(--stretch);}
.tag.star{background:var(--stretch-bg);border-color:var(--stretch);color:var(--stretch);}
.tag.applied{background:var(--applied-bg);border-color:var(--applied);color:var(--applied);}
.tag.skipped{background:var(--skipped-bg);border-color:var(--skipped);color:var(--skipped);}
.actions{margin-top:7px;display:flex;gap:6px;flex-wrap:wrap;}
.card.skipped{opacity:.55;}
.card.skipped:hover{opacity:1;}
details.company{background:var(--card);border:1px solid var(--rule);border-radius:2px;
  margin:8px 0;box-shadow:var(--shadow);overflow:hidden;}
details.company summary{padding:11px 14px;cursor:pointer;display:flex;justify-content:space-between;
  align-items:center;list-style:none;gap:10px;}
details.company summary::-webkit-details-marker{display:none;}
details.company summary::marker{content:'';}
details.company summary::before{content:'▸';color:var(--faint);margin-right:9px;font-size:11px;}
details.company[open] summary::before{content:'▾';}
details.company summary:hover{background:#efe9da;}
@media (prefers-color-scheme: dark){details.company summary:hover{background:#2a2619;}}
details.company .company-body{padding:2px 14px 12px;border-top:1px solid var(--rule);}
details.company .company-body .card{box-shadow:none;}
.company-name{font-weight:bold;font-variant:small-caps;letter-spacing:.3px;}
.dateline{display:flex;align-items:center;gap:12px;margin:30px 0 14px;
  font-variant:small-caps;letter-spacing:1px;color:var(--ink);font-size:15px;}
.dateline::before,.dateline::after{content:'';flex:0 0 auto;width:28px;border-top:3px double var(--ink);}
.dateline strong{white-space:nowrap;}
.daynav{display:flex;justify-content:space-between;align-items:center;margin:18px 0;
  font-size:13px;color:var(--faint);}
.daynav a{color:var(--link);text-decoration:none;}
.daynav a:hover{text-decoration:underline;}
.daynav .empty-side{visibility:hidden;}
.archive{font-size:12px;color:var(--faint);margin:16px 0;padding:10px 12px;background:var(--card);
  border:1px solid var(--rule);border-radius:2px;}
.archive a{color:var(--link);text-decoration:none;margin-right:10px;}
.archive a.current{color:var(--ink);font-weight:bold;text-decoration:underline;}
.stat-row{display:flex;gap:18px;font-size:12px;color:var(--faint);margin:4px 0 2px;flex-wrap:wrap;}
.stat-row strong{color:var(--ink);}
footer{margin-top:34px;border-top:1px solid var(--rule);padding-top:10px;font-size:12px;color:var(--faint);}
footer a{color:var(--link);text-decoration:none;}
code{background:#efe9da;padding:1px 5px;font-size:13px;border-radius:2px;}
@media (prefers-color-scheme: dark){code{background:#2a2619;}}
`;

// Progressive enhancement, only for the job-status buttons: a plain <form
// POST still works with JS off (full reload, same as before) — this just
// intercepts the submit, does the POST in the background, and updates the
// one card in place, so triaging a long list doesn't reload the whole page
// on every click. Everything else on this dashboard stays server-rendered
// with no JS involved, per the original design.
export const STATUS_SCRIPT = `
(function () {
  if (!window.fetch) return; // no fetch -> forms just submit normally, unaffected
  function actionsHtml(id, status) {
    var out = '';
    if (status !== 'applied') out += '<form method="post" action="/jobs/' + id + '/applied"><button>applied</button></form>';
    if (status !== 'not_applicable') out += '<form method="post" action="/jobs/' + id + '/skip"><button>not applicable</button></form>';
    if (status && status !== 'open') out += '<form method="post" action="/jobs/' + id + '/open"><button>reset</button></form>';
    return out;
  }
  function badgeHtml(status) {
    if (status === 'applied') return '<span class="tag applied">applied</span>';
    if (status === 'not_applicable') return '<span class="tag skipped">not applicable</span>';
    return '';
  }
  document.addEventListener('submit', function (e) {
    var form = e.target;
    var m = form.action && form.action.match(/\\/jobs\\/(\\d+)\\/(applied|skip|open)$/);
    if (!m) return; // not one of ours (e.g. done/cancel on items/reminders) -> normal submit
    var card = form.closest('.card');
    if (!card) return;
    e.preventDefault();
    var id = m[1];
    var status = m[2] === 'applied' ? 'applied' : m[2] === 'skip' ? 'not_applicable' : 'open';
    fetch(form.action, { method: 'POST' })
      .then(function (res) {
        if (!res.ok) throw new Error('bad status ' + res.status);
        card.classList.toggle('skipped', status === 'not_applicable');
        var actions = card.querySelector('.actions');
        if (actions) actions.innerHTML = actionsHtml(id, status);
        var badges = card.querySelector('.badges');
        if (badges) {
          var old = badges.querySelector('.tag.applied, .tag.skipped');
          if (old) old.remove();
          var badge = badgeHtml(status);
          if (badge) badges.insertAdjacentHTML('afterbegin', badge);
        }
      })
      .catch(function () {
        form.submit(); // fetch failed for any reason -> fall back to a real page load
      });
  });
})();
`;

export function page(body, title = 'whatsapp-agent') {
  return `<!doctype html><html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="refresh" content="60">
<title>${title}</title>
<style>${CSS}</style></head>
<body>${body}
<script>${STATUS_SCRIPT}</script>
</body></html>`;
}

// Shared between web.js's homepage card and webPages.js's /jobs day-browse
// card, so a job posting looks and behaves identically wherever it's shown.

const JOB_STATUS_BADGE = {
  applied: '<span class="tag applied">applied</span>',
  not_applicable: '<span class="tag skipped">not applicable</span>',
};

export function jobStatusBadge(status) {
  return JOB_STATUS_BADGE[status] || '';
}

const JOB_STATUS_ROUTE = { applied: 'applied', not_applicable: 'skip' }; // URL segment per status

export function jobStatusActions(j) {
  const btn = (status, label) =>
    `<form method="post" action="/jobs/${j.id}/${JOB_STATUS_ROUTE[status] || status}"><button>${label}</button></form>`;
  const buttons = [];
  if (j.status !== 'applied') buttons.push(btn('applied', 'applied'));
  if (j.status !== 'not_applicable') buttons.push(btn('not_applicable', 'not applicable'));
  if (j.status && j.status !== 'open') buttons.push(btn('open', 'reset'));
  return `<div class="actions">${buttons.join('')}</div>`;
}

// Untriaged (open) postings sort above ones already marked applied / not
// applicable, so a list leads with what still needs a decision instead of
// mixing in stuff you've already dealt with.
export function sortByStatus(jobs) {
  const rank = (j) => (!j.status || j.status === 'open' ? 0 : 1);
  return jobs.slice().sort((a, b) => rank(a) - rank(b));
}

export function navTabs(active) {
  const tabs = [
    ['/', 'Dashboard'],
    ['/news', '🗞️ News'],
    ['/jobs', '💼 Jobs'],
  ];
  return `<nav class="tabs">${tabs
    .map(([href, label], i) => `${i ? '<span class="sep">·</span>' : ''}<a href="${href}"${href === active ? ' class="active"' : ''}>${label}</a>`)
    .join('')}</nav>`;
}
