// Offline test of the web dashboard's three pages (/, /news, /jobs): empty
// states, day-grouping + navigation, XSS escaping, and dark-mode CSS.
// No network, no WhatsApp, no LLM, no real HTTP server (calls the render
// functions directly).
//   node scripts/web-smoke.js
import path from 'node:path';
import os from 'node:os';

process.env.DB_PATH = path.join(os.tmpdir(), `wa-web-smoke-${Date.now()}.json`);
process.env.AGENT_TZ = process.env.AGENT_TZ || 'Asia/Kolkata';

const { renderDashboard } = await import('../src/web.js');
const { renderNewsPage, renderJobsPage } = await import('../src/webPages.js');
const { CSS, STATUS_SCRIPT, page } = await import('../src/webTheme.js');
const store = await import('../src/store.js');

let failures = 0;
const expect = (cond, what) => {
  console.log(`  ${cond ? '✓' : '✗ FAILED:'} ${what}`);
  if (!cond) failures++;
};

// STATUS_SCRIPT (embedded on every page, see webTheme.js) legitimately
// contains the literal markup strings it builds client-side — 'tag applied',
// 'tag skipped', etc. — so a whole-page substring check for "is this badge
// absent" would false-positive on the script's own source. It's always
// appended after all card content, so strip it before checking for absence.
const renderedOnly = (html) => html.split('<script>')[0];

console.log('— empty states (no data yet) —');
expect(!renderNewsPage({}).includes('undefined'), 'news page empty state has no "undefined"');
expect(renderNewsPage({}).includes('No digests'), 'news page shows empty-state copy');
expect(!renderJobsPage({}).includes('undefined'), 'jobs page empty state has no "undefined"');
expect(renderJobsPage({}).includes('No matches'), 'jobs page shows empty-state copy');

console.log('\n— theme —');
expect(CSS.includes('prefers-color-scheme: dark'), 'dark-mode variant present');
expect(CSS.includes('--good') && CSS.includes('--stretch'), 'fit-tag accent colors defined');

console.log('\n— status-button script (progressive enhancement, avoids full reload on click) —');
{
  const html = page('<div>x</div>');
  expect(html.includes('<script>') && html.includes(STATUS_SCRIPT.trim().slice(0, 30)), 'script is actually embedded in every rendered page');
  expect(STATUS_SCRIPT.includes('e.preventDefault()'), 'intercepts the form submit rather than letting it navigate');
  expect(STATUS_SCRIPT.includes("fetch(form.action"), 'submits the status change via fetch in the background');
  expect(STATUS_SCRIPT.includes('form.submit()'), 'falls back to a real page submit if fetch fails — never silently does nothing');
  expect(STATUS_SCRIPT.includes('if (!window.fetch) return'), 'no-op (plain form submit) on browsers without fetch, rather than erroring');
  expect(STATUS_SCRIPT.includes("card.classList.toggle('skipped'"), 'toggles the dimming class in place on success');
  expect(/\.actions/.test(STATUS_SCRIPT) && /\.badges/.test(STATUS_SCRIPT), 'updates both the button row and the badge in place');
}

console.log('\n— seed 2 days of news + jobs —');
const DAY_MS = 86_400_000;
const now = Date.now();
const today = now;
const yesterday = now - DAY_MS;

store.addNews([
  { key: 'n1', source: 'openai', sourceName: 'OpenAI', tier: 'labs', star: true, title: 'Today headline <script>alert(1)</script>', url: 'https://example.com/1', ts: today },
  { key: 'n2', source: 'simonw', sourceName: 'Simon Willison', tier: 'voices', star: false, title: 'Today voices post', url: 'https://example.com/2', ts: today },
]);
store.markNewsDigested(['n1', 'n2']);
// Force n3 into "yesterday" by setting digestedAt directly (addNews/markNewsDigested use Date.now()).
store.addNews([{ key: 'n3', source: 'hn', sourceName: 'Hacker News', tier: 'community', star: true, title: 'Yesterday HN post', url: 'https://example.com/3', ts: yesterday }]);
store.markNewsDigested(['n3']);

store.addJobs([
  { key: 'j1', company: 'Acme <b>Corp</b>', title: 'Backend Engineer', url: 'https://example.com/j1', location: 'Remote', fit: 'Good fit' },
  { key: 'j2', company: 'Beta Inc', title: 'Senior AI Engineer', url: 'https://example.com/j2', location: 'Bengaluru', fit: 'Stretch' },
]);
store.markJobsDelivered(['j1', 'j2']);

// Backdate n3/yesterday's news and simulate a second job day by editing the
// store file directly — addNews/markNewsDigested always stamp "now".
{
  const fs = await import('node:fs');
  const raw = JSON.parse(fs.readFileSync(store.dbPath(), 'utf8'));
  const n3 = raw.news.find((n) => n.key === 'n3');
  n3.digestedAt = yesterday;
  const j2 = raw.jobs.find((j) => j.key === 'j2');
  j2.deliveredAt = yesterday;
  fs.writeFileSync(store.dbPath(), JSON.stringify(raw, null, 2));
  store.reload();
}

console.log('\n— news page: today (default) —');
const newsToday = renderNewsPage({});
expect(newsToday.includes('OpenAI'), 'shows today\'s source');
expect(newsToday.includes('Simon Willison'), 'shows both tiers for today');
expect(!newsToday.includes('Hacker News'), 'does NOT show yesterday\'s item on the default (newest) day');
expect(newsToday.includes('&lt;script&gt;'), 'title is HTML-escaped (XSS safe)');
expect(!newsToday.includes('<script>alert'), 'raw script tag never appears unescaped');
expect(newsToday.includes('★ starter'), 'star badge rendered for starter sources');
expect(newsToday.includes('🧪 Labs'), 'tier section header rendered');

console.log('\n— news page: day navigation —');
const yKey = new Date(yesterday).toISOString().slice(0, 10);
const newsYesterday = renderNewsPage({ day: yKey });
expect(newsYesterday.includes('Hacker News'), 'navigating to ?day=<yesterday> shows that day\'s item');
expect(!newsYesterday.includes('OpenAI'), 'yesterday view does not leak today\'s items');
expect(newsToday.includes('/news?day='), 'today\'s page links to another day (nav present)');

console.log('\n— jobs page: today (default) —');
const jobsToday = renderJobsPage({});
expect(jobsToday.includes('Acme'), 'shows today\'s company');
expect(jobsToday.includes('&lt;b&gt;Corp&lt;/b&gt;'), 'company name is HTML-escaped');
expect(!jobsToday.includes('Beta Inc'), 'does not show yesterday\'s posting on the default day');
expect(jobsToday.includes('tag good'), 'Good fit renders with the good-fit class');

console.log('\n— job status: open (default) shows both action buttons, no badge —');
const j1id = store.recentJobs(500).find((j) => j.company.includes('Acme')).id;
{
  const html = renderJobsPage({});
  expect(html.includes(`/jobs/${j1id}/applied`), 'open job offers an "applied" action');
  expect(html.includes(`/jobs/${j1id}/skip`), 'open job offers a "not applicable" action');
  expect(!html.includes(`/jobs/${j1id}/open`), 'open job does not offer a redundant "reset to open" action');
  expect(!renderedOnly(html).includes('tag applied') && !renderedOnly(html).includes('tag skipped'), 'no status badge shown while still open');
}

console.log('\n— job status: applied —');
store.setJobStatus(j1id, 'applied');
{
  const html = renderJobsPage({});
  const dash = renderDashboard();
  expect(html.includes('tag applied">applied<'), '"applied" badge shown on /jobs');
  expect(dash.includes('tag applied">applied<'), 'same "applied" badge shown on the homepage card');
  expect(!html.includes(`/jobs/${j1id}/applied`), 'no longer offers "applied" again once already applied');
  expect(html.includes(`/jobs/${j1id}/skip`), 'still offers "not applicable" as an alternative');
  expect(html.includes(`/jobs/${j1id}/open`), 'now offers "reset" back to open');
  expect(!html.includes('card skipped'), 'applied card is not visually dimmed (dimming is only for not_applicable)');
  expect(html.includes(`data-job-id="${j1id}"`) && html.includes('class="badges"'), 'card carries the hooks the status script needs (data-job-id, .badges) to update it without a reload');
}

console.log('\n— job status: not applicable (dims the card) —');
store.setJobStatus(j1id, 'not_applicable');
{
  const html = renderJobsPage({});
  expect(html.includes('tag skipped">not applicable<'), '"not applicable" badge shown');
  expect(html.includes('card skipped'), 'card gets the dimming class once marked not applicable');
  expect(html.includes(`/jobs/${j1id}/applied`), 'still offers "applied" as an alternative');
  expect(html.includes(`/jobs/${j1id}/open`), 'still offers "reset" back to open');
}

console.log('\n— job status: reset back to open —');
store.setJobStatus(j1id, 'open');
{
  const html = renderJobsPage({});
  expect(!renderedOnly(html).includes('tag applied') && !renderedOnly(html).includes('tag skipped'), 'badge cleared after reset');
  expect(!html.includes('card skipped'), 'dimming cleared after reset');
}

console.log('\n— jobs page: day navigation —');
const jobsYesterday = renderJobsPage({ day: yKey });
expect(jobsYesterday.includes('Beta Inc'), 'navigating to ?day=<yesterday> shows that posting');
expect(jobsYesterday.includes('tag stretch'), 'Stretch renders with the stretch class');

console.log('\n— jobs page: a heavy day renders everything, nothing hidden —');
store.addJobs(Array.from({ length: 250 }, (_, i) => ({
  key: `cap${i}`, company: `CapCo${i}`, title: 'Software Engineer', url: `https://example.com/cap${i}`, location: '', fit: 'Good fit',
})));
store.markJobsDelivered(Array.from({ length: 250 }, (_, i) => `cap${i}`));
const jobsCapped = renderJobsPage({});
expect(jobsCapped.includes('<strong>251</strong> postings'), 'stat-row shows the true total (1 existing + 250 new = 251)');
expect((jobsCapped.match(/CapCo\d+/g) || []).length === 250, 'every one of the 250 companies actually renders — no render cap');
expect(!jobsCapped.includes('more from this day'), 'no "hidden, capped" overflow notice — there is nothing left out to report');

console.log('\n— jobs page: day view groups postings into company accordions —');
{
  const html = renderJobsPage({});
  expect(html.includes('<details class="company">'), 'renders native <details> accordions (no JS needed)');
  expect(html.includes('<summary>'), 'each company has a <summary> click target');
  expect(html.includes('Acme'), 'shows a company from "today"');
  expect(!html.includes('Beta Inc'), 'does NOT show yesterday\'s company — the accordion grouping is still day-scoped, only one day at a time');
  expect(html.includes('<div class="daynav">'), 'day prev/next nav is still present — there is only one view now, and it is day-scoped');
}

console.log('\n— jobs page: a heavy company inside a day still shows every role —');
store.addJobs(Array.from({ length: 40 }, (_, i) => ({
  key: `bigco${i}`, company: 'BigCo', title: `Role ${i}`, url: `https://example.com/bigco${i}`, location: '', fit: 'Good fit',
})));
store.markJobsDelivered(Array.from({ length: 40 }, (_, i) => `bigco${i}`));
{
  const html = renderJobsPage({});
  expect(html.includes('40 roles'), 'accordion header shows the true total for that company (40)');
  expect((html.match(/Role \d+/g) || []).length === 40, 'all 40 roles actually render inside the accordion — no per-company cap');
  expect(!html.includes('more from BigCo'), 'no overflow notice — nothing was left out');
}

console.log('\n— jobs page: untriaged roles sort above already-triaged ones within a company —');
store.addJobs([
  { key: 'ord-a', company: 'OrderCo', title: 'Role A (will be applied)', url: 'https://example.com/ord-a', location: '', fit: 'Good fit' },
  { key: 'ord-b', company: 'OrderCo', title: 'Role B (stays open)', url: 'https://example.com/ord-b', location: '', fit: 'Good fit' },
  { key: 'ord-c', company: 'OrderCo', title: 'Role C (not applicable)', url: 'https://example.com/ord-c', location: '', fit: 'Good fit' },
]);
store.markJobsDelivered(['ord-a', 'ord-b', 'ord-c']);
{
  const ordJobs = store.recentJobs(2000).filter((j) => j.company === 'OrderCo');
  const ordA = ordJobs.find((j) => j.title.startsWith('Role A'));
  const ordC = ordJobs.find((j) => j.title.startsWith('Role C'));
  store.setJobStatus(ordA.id, 'applied');
  store.setJobStatus(ordC.id, 'not_applicable');

  const html = renderJobsPage({});
  expect(html.includes('3 roles · 1 open'), 'accordion count reflects only 1 of 3 still open');
  const from = html.indexOf('OrderCo');
  const bIdx = html.indexOf('Role B', from);
  const aIdx = html.indexOf('Role A', from);
  const cIdx = html.indexOf('Role C', from);
  expect(bIdx > -1 && aIdx > -1 && cIdx > -1 && bIdx < aIdx && bIdx < cIdx, 'still-open "Role B" renders above the applied and not-applicable roles, not in original add order');

  const dash = renderDashboard();
  const dbIdx = dash.indexOf('Role B');
  const daIdx = dash.indexOf('Role A');
  const dcIdx = dash.indexOf('Role C');
  expect(dbIdx > -1 && daIdx > -1 && dcIdx > -1 && dbIdx < daIdx && dbIdx < dcIdx, 'homepage "Recent jobs" list applies the same sort — still-open roles above applied/not-applicable ones');
}

console.log('\n— dashboard still renders with all data present —');
const dash = renderDashboard();
expect(dash.includes('whatsapp-agent'), 'dashboard renders');
expect(dash.includes('/news') && dash.includes('/jobs'), 'dashboard nav links to both new pages');

console.log(failures === 0 ? '\nAll good ✅' : `\n${failures} check(s) FAILED ❌`);
process.exit(failures === 0 ? 0 : 1);
