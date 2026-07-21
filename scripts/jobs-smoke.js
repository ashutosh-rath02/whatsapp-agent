// Offline test of the job-watch feature: catalog loading, the relevance/fit
// filter against real-world-shaped titles, store dedup, and message building
// (including the overflow cap). No network, no WhatsApp, no LLM.
//   node scripts/jobs-smoke.js
import path from 'node:path';
import os from 'node:os';

process.env.DB_PATH = path.join(os.tmpdir(), `wa-jobs-smoke-${Date.now()}.json`);
process.env.JOBS_MAX_PER_MESSAGE = '3'; // small, to exercise the cap deterministically

const { isRelevant, fitFor, isIndiaLocation } = await import('../src/jobRelevance.js');
const { loadCompanies } = await import('../src/jobSources.js');
const { supported } = await import('../src/ats/index.js');
const store = await import('../src/store.js');
const { buildJobsMessage } = await import('../src/jobs.js');

let failures = 0;
const expect = (cond, what) => {
  console.log(`  ${cond ? '✓' : '✗ FAILED:'} ${what}`);
  if (!cond) failures++;
};

console.log('— relevance: should match —');
for (const t of [
  'Software Engineer',
  'Senior Software Developer',
  'Full Stack Engineer (React/Node)',
  'Full-Stack Developer',
  'Backend Engineer, Payments',
  'Front-end Engineer',
  'AI Engineer - FDE (Forward Deployed Engineer)',
  'Applied AI Engineer, Beneficial Deployments',
  'Machine Learning Engineer, AI Labs',
  'Forward Deployed Engineer',
  'SDE II',
  'Junior Software Engineer (C/C++, Linux)',
]) {
  expect(isRelevant(t), `"${t}" matches`);
}

console.log('\n— relevance: should NOT match —');
for (const t of [
  'Engineering Manager, Platform',
  'Director of Engineering',
  'VP, Engineering',
  'Sales Engineer',
  'Support Engineer',
  'Site Reliability Engineer',
  'Data Engineer, Analytics',
  'DevOps Engineer',
  'Product Marketing Manager',
  'Head of Growth Marketing',
  'Solutions Architect',
]) {
  expect(!isRelevant(t), `"${t}" excluded`);
}

console.log('\n— fit tagging (label only, never gates delivery) —');
expect(fitFor('Senior Software Engineer') === 'Stretch', 'Senior -> Stretch');
expect(fitFor('Staff Backend Engineer') === 'Stretch', 'Staff -> Stretch');
expect(fitFor('Software Engineer') === 'Good fit', 'no seniority word -> Good fit');
expect(fitFor('Junior Software Engineer') === 'Good fit', 'Junior -> Good fit');
expect(isRelevant('Senior Software Engineer'), 'Stretch-tagged roles are still relevant (not filtered)');

console.log('\n— India-only location filter —');
for (const loc of [
  'Bengaluru',
  'Bangalore, IND',
  'Bengaluru, KA, India',
  'Gurugram, , India',
  'Hyderabad, Telangana, India',
  'Remote - India',
  'US, India, UK', // India present in a multi-country posting
  'Pune',
  'New Delhi',
  'Mumbai, Maharashtra',
]) {
  expect(isIndiaLocation(loc), `"${loc}" -> India`);
}
for (const loc of [
  'Cork, Co. Cork, Ireland',
  'Seoul, South Korea',
  'Remote - United Kingdom',
  'US-CA-Menlo Park',
  'Petah Tikva, , Israel',
  'Remote', // ambiguous, no country -> excluded per "not outside"
  'Indiana, US', // must not false-positive on "Ind" substring
  '',
]) {
  expect(!isIndiaLocation(loc), `"${loc}" -> not India`);
}

console.log('\n— catalog —');
const companies = loadCompanies();
expect(companies.length > 100, `catalog loads (${companies.length} pollable companies)`);
expect(companies.every((c) => supported(c.ats)), 'every loaded company has a working adapter');
expect(companies.every((c) => c.slug || c.ats === 'workday' || c.ats === 'oracle-hcm'), 'every non-workday/oracle company has a slug');
const dupKeys = new Set();
let dup = false;
for (const c of companies) {
  const k = `${c.ats}:${c.slug || c.careerUrl}`;
  if (dupKeys.has(k)) dup = true;
  dupKeys.add(k);
}
expect(!dup, 'no duplicate company targets after master+startups merge');

console.log('\n— store: dedup + message building —');
const mk = (n, extra = {}) => ({
  key: `test:${n}`, company: `Co${n}`, title: `Software Engineer ${n}`,
  url: `https://example.com/${n}`, location: 'Remote', fit: 'Good fit', ...extra,
});
expect(store.addJobs([mk(1), mk(2)]).length === 2, 'two new postings stored');
expect(store.addJobs([mk(1), mk(3)]).length === 1, 'duplicate key skipped, new one stored');
expect(store.pendingJobs().length === 3, '3 pending');

const msg1 = buildJobsMessage();
expect(msg1 !== null, 'message built when postings are pending');
expect(msg1.text.includes('3 new job posting'), 'header shows true total, not capped count');
expect((msg1.text.match(/Co\d/g) || []).length === 3, `all 3 shown under the cap of 3 (JOBS_MAX_PER_MESSAGE)`);
expect(!msg1.text.includes('more this cycle'), 'no overflow notice when everything fits');
store.markJobsDelivered(msg1.keys);
expect(store.pendingJobs().length === 0, 'delivered postings no longer pending');
expect(buildJobsMessage() === null, 'nothing pending -> null (no empty message)');

console.log('\n— overflow cap —');
store.addJobs(Array.from({ length: 7 }, (_, i) => mk(`cap${i}`)));
const msg2 = buildJobsMessage();
expect(msg2.text.includes('7 new job posting'), 'header shows true total (7)');
expect((msg2.text.match(/\*Cocap\d+\*/g) || []).length === 3, 'body still capped at 3 shown');
expect(msg2.text.includes('+4 more this cycle'), 'overflow count correct (7 - 3 = 4)');
store.markJobsDelivered(msg2.keys);
expect(store.pendingJobs().length === 0, 'capped-out postings still marked delivered (never re-sent)');

console.log('\n— job status (applied / not applicable / reset) —');
{
  const item = store.addJobs([mk('status1')])[0];
  expect(item.status === 'open', 'a freshly-added job defaults to open');
  expect(typeof item.id === 'number', 'a freshly-added job gets a numeric id');
  store.markJobsDelivered([item.key]); // recentJobs() below only returns delivered jobs

  expect(store.setJobStatus(item.id, 'applied') === true, 'setJobStatus(applied) succeeds');
  const afterApplied = store.recentJobs(500).find((j) => j.id === item.id);
  expect(afterApplied.status === 'applied', 'status persisted as applied');
  expect(typeof afterApplied.statusAt === 'number', 'statusAt timestamp recorded');

  expect(store.setJobStatus(item.id, 'not_applicable') === true, 'status can move from applied -> not_applicable');
  expect(store.recentJobs(500).find((j) => j.id === item.id).status === 'not_applicable', 'status updated correctly');

  expect(store.setJobStatus(item.id, 'open') === true, 'status can be reset back to open');
  expect(store.recentJobs(500).find((j) => j.id === item.id).status === 'open', 'reset applied correctly');

  expect(store.setJobStatus(item.id, 'bogus_status') === false, 'an invalid status is rejected, not silently stored');
  expect(store.recentJobs(500).find((j) => j.id === item.id).status === 'open', 'rejected status leaves the prior value untouched');

  expect(store.setJobStatus(999999, 'applied') === false, 'setting status on a nonexistent id returns false, does not throw');
}

console.log('\n— job id migration (legacy entries with no id/status) —');
{
  const fs = await import('node:fs');
  const raw = JSON.parse(fs.readFileSync(store.dbPath(), 'utf8'));
  const beforeCount = raw.jobs.length;
  // Simulate data written before status-tracking existed: no id, no status.
  raw.jobs.push({ key: 'legacy:1', company: 'LegacyCo', title: 'Old Posting', url: 'https://e.com/legacy', location: '', fit: 'Good fit', seenAt: Date.now(), deliveredAt: Date.now() });
  fs.writeFileSync(store.dbPath(), JSON.stringify(raw, null, 2));
  store.reload();

  const migrated = store.recentJobs(500).find((j) => j.company === 'LegacyCo');
  expect(migrated !== undefined, 'legacy entry still present after migration');
  expect(typeof migrated.id === 'number', 'legacy entry backfilled with a numeric id');
  expect(migrated.status === 'open', 'legacy entry backfilled with status "open"');

  const ids = store.recentJobs(500).map((j) => j.id);
  expect(new Set(ids).size === ids.length, 'no id collisions after migrating a mix of old and new entries');

  const fresh = store.addJobs([mk('after-migration')])[0];
  expect(!ids.includes(fresh.id), 'ids assigned after migration continue from the backfilled sequence, no reuse');
}

console.log(failures === 0 ? '\nAll good ✅' : `\n${failures} check(s) FAILED ❌`);
process.exit(failures === 0 ? 0 : 1);
