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
const { CSS } = await import('../src/webTheme.js');
const store = await import('../src/store.js');

let failures = 0;
const expect = (cond, what) => {
  console.log(`  ${cond ? '✓' : '✗ FAILED:'} ${what}`);
  if (!cond) failures++;
};

console.log('— empty states (no data yet) —');
expect(!renderNewsPage({}).includes('undefined'), 'news page empty state has no "undefined"');
expect(renderNewsPage({}).includes('No digests'), 'news page shows empty-state copy');
expect(!renderJobsPage({}).includes('undefined'), 'jobs page empty state has no "undefined"');
expect(renderJobsPage({}).includes('No matches'), 'jobs page shows empty-state copy');

console.log('\n— theme —');
expect(CSS.includes('prefers-color-scheme: dark'), 'dark-mode variant present');
expect(CSS.includes('--good') && CSS.includes('--stretch'), 'fit-tag accent colors defined');

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

console.log('\n— jobs page: day navigation —');
const jobsYesterday = renderJobsPage({ day: yKey });
expect(jobsYesterday.includes('Beta Inc'), 'navigating to ?day=<yesterday> shows that posting');
expect(jobsYesterday.includes('tag stretch'), 'Stretch renders with the stretch class');

console.log('\n— jobs page: render cap on a heavy day —');
store.addJobs(Array.from({ length: 250 }, (_, i) => ({
  key: `cap${i}`, company: `CapCo${i}`, title: 'Software Engineer', url: `https://example.com/cap${i}`, location: '', fit: 'Good fit',
})));
store.markJobsDelivered(Array.from({ length: 250 }, (_, i) => `cap${i}`));
const jobsCapped = renderJobsPage({});
expect(jobsCapped.includes('<strong>251</strong> postings'), 'stat-row shows the true uncapped total (1 existing + 250 new = 251)');
expect((jobsCapped.match(/CapCo\d+/g) || []).length <= 200, 'rendered card count stays within the cap');
expect(jobsCapped.includes('more from this day'), 'overflow notice shown when a day exceeds the cap');

console.log('\n— dashboard still renders with all data present —');
const dash = renderDashboard();
expect(dash.includes('whatsapp-agent'), 'dashboard renders');
expect(dash.includes('/news') && dash.includes('/jobs'), 'dashboard nav links to both new pages');

console.log(failures === 0 ? '\nAll good ✅' : `\n${failures} check(s) FAILED ❌`);
process.exit(failures === 0 ? 0 : 1);
