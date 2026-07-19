// LIVE test of the news pipeline: polls every enabled source over the network,
// prints per-source results, then the digest exactly as WhatsApp would get it.
// Uses a throwaway DB — does not touch real data or send anything.
//   node scripts/news-live.js            (set NEWS_LLM_PICKS=false to skip the LLM)
//
// --seed: run against the REAL datastore and mark everything collected as
// already digested. Run once after enabling the feature so the first morning
// digest contains only genuinely new items, not the whole archive.
import path from 'node:path';
import os from 'node:os';

const seedMode = process.argv.includes('--seed');
if (!seedMode) process.env.DB_PATH = path.join(os.tmpdir(), `wa-news-live-${Date.now()}.json`);
process.env.AGENT_TZ = process.env.AGENT_TZ || 'Asia/Kolkata';

const { collectNews, buildDigest } = await import('../src/news.js');
const { enabledSources } = await import('../src/newsSources.js');
const { pendingNews, markNewsDigested, dbPath } = await import('../src/store.js');

if (seedMode) {
  console.log(`Seeding ${dbPath()} — collected items will be marked as read…`);
  const res = await collectNews();
  const pending = pendingNews();
  markNewsDigested(pending.map((n) => n.key));
  console.log(`Seeded: ${res.added} item(s) stored & marked digested (${res.failed.length} source(s) failed).`);
  console.log('The next morning digest will only contain items newer than right now.');
  process.exit(0);
}

console.log(`Polling ${enabledSources().length} sources…\n`);
const t0 = Date.now();
const { added, polled, failed } = await collectNews();
const secs = ((Date.now() - t0) / 1000).toFixed(1);

const bySource = {};
for (const n of pendingNews()) (bySource[n.source] ||= []).push(n);
for (const s of enabledSources()) {
  const rows = bySource[s.id] || [];
  const mark = failed.includes(s.id) ? '✗ FAILED' : `${String(rows.length).padStart(2)} items`;
  console.log(`  ${s.id.padEnd(18)} ${mark}${rows[0] ? `  e.g. ${rows[0].title.slice(0, 60)}` : ''}`);
}

console.log(`\n${added} new items from ${polled} sources in ${secs}s (${failed.length} failed)`);

const digest = await buildDigest();
if (!digest) {
  console.log('\nNo digest (nothing pending).');
  process.exit(1);
}
console.log(`\n──── digest preview (${digest.text.length} chars) ────\n`);
console.log(digest.text);
console.log('\n──── end ────');
// Healthy = most sources produced items and a digest exists.
process.exit(failed.length > polled / 2 ? 1 : 0);
