// LIVE test of the job-watch pipeline: polls every company over the real
// network, prints per-company results, then the message exactly as
// WhatsApp would get it. Uses a throwaway DB — no real data touched.
//   node scripts/jobs-live.js
//
// --seed: run against the REAL datastore and mark every currently-open
// posting as already delivered. Run once before enabling the feature —
// without it, the first cycle floods the chat with every existing posting
// across ~130 companies (1342 in the initial test run) instead of just
// what opens from here on.
import path from 'node:path';
import os from 'node:os';

const seedMode = process.argv.includes('--seed');
if (!seedMode) process.env.DB_PATH = path.join(os.tmpdir(), `wa-jobs-live-${Date.now()}.json`);

const { collectJobs, buildJobsMessage } = await import('../src/jobs.js');
const { loadCompanies } = await import('../src/jobSources.js');
const { pendingJobs, markJobsDelivered, dbPath } = await import('../src/store.js');

if (seedMode) {
  console.log(`Seeding ${dbPath()} — every currently-open matching posting will be marked as already delivered…`);
  const res = await collectJobs();
  const pending = pendingJobs();
  markJobsDelivered(pending.map((j) => j.key));
  console.log(`Seeded: ${res.added} posting(s) stored & marked delivered (${res.failed.length} companies failed).`);
  console.log('From here on, only postings that open after this point will be sent.');
  process.exit(0);
}

console.log(`Polling ${loadCompanies().length} companies...\n`);
const t0 = Date.now();
const { added, polled, failed } = await collectJobs();
const secs = ((Date.now() - t0) / 1000).toFixed(1);

console.log(`${added} relevant new postings from ${polled} companies in ${secs}s (${failed.length} failed)\n`);
if (failed.length) console.log('failed:', failed.slice(0, 20).join(', '), failed.length > 20 ? `... +${failed.length - 20} more` : '');

const byCompany = {};
for (const j of pendingJobs()) (byCompany[j.company] ||= []).push(j);
console.log(`\n${Object.keys(byCompany).length} companies with relevant matches:`);
for (const [co, jobs] of Object.entries(byCompany)) {
  console.log(`  ${co}: ${jobs.length}`);
  for (const j of jobs.slice(0, 2)) console.log(`    - ${j.title} (${j.fit}) @ ${j.location}`);
}

const msg = buildJobsMessage();
console.log(`\n──── message preview (${msg ? msg.text.length : 0} chars) ────\n`);
console.log(msg ? msg.text.slice(0, 3000) : '(no message — nothing relevant found)');
console.log('\n──── end ────');
process.exit(failed.length > polled / 2 ? 1 : 0);
