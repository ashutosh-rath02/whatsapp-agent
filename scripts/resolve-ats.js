// Enrichment pass for data/companies.csv and data/funded-startups.csv: for
// rows still tagged ats=needs-resolution (no confirmed job board), guess a
// career-board slug from the company name and test it against the ATS
// platforms that expose a public, no-auth JSON API (Greenhouse, Lever,
// Ashby, SmartRecruiters, Workable) via the real adapters in src/ats/, so
// resolution and the live poller always agree on how a board's data parses.
// A confirmed match is written back into that row's ats/career_url/
// confidence columns, which is all jobSources.js needs to start polling it.
// Workday, Oracle HCM, and anything on a custom career page still need
// manual/LLM lookup -- there's no guessable slug for those.
//
// A slug match alone is not enough evidence: short/generic company names
// (e.g. "Blend AI" -> slug "blend") can collide with an unrelated,
// same-named company elsewhere -- confirmed during testing, where "blend"
// and "august" both resolved to real but wrong (US-based) companies. Since
// this whole watchlist is India-only, a match only counts if at least one
// of its actual open postings has an India-recognizable location (the same
// isIndiaLocation() check the live poller applies before ever delivering a
// posting) -- an empty or all-foreign board is treated as no match, same
// "unconfirmed doesn't get the benefit of the doubt" rule jobRelevance.js
// already applies.
//   node scripts/resolve-ats.js data/funded-startups.csv
//   node scripts/resolve-ats.js data/companies.csv [--limit=50]
import fs from 'node:fs';
import path from 'node:path';
import { parseCsv, stringifyCsv } from '../src/csv.js';
import { isIndiaLocation } from '../src/jobRelevance.js';
import * as greenhouse from '../src/ats/greenhouse.js';
import * as lever from '../src/ats/lever.js';
import * as ashby from '../src/ats/ashby.js';
import * as smartrecruiters from '../src/ats/smartrecruiters.js';
import * as workable from '../src/ats/workable.js';

const file = process.argv[2];
if (!file) {
  console.error('usage: node scripts/resolve-ats.js <path-to-csv> [--limit=N]');
  process.exit(1);
}
const limitArg = process.argv.find((a) => a.startsWith('--limit='));
const limit = limitArg ? Number(limitArg.split('=')[1]) : Infinity;
const cityArg = process.argv.find((a) => a.startsWith('--city='));
const cityFilter = cityArg ? cityArg.split('=')[1].toLowerCase() : null;
const sourceArg = process.argv.find((a) => a.startsWith('--source='));
const sourceFilter = sourceArg ? sourceArg.split('=')[1].toLowerCase() : null;

const CONCURRENCY = 8;
const STOPWORDS = new Set([
  'inc', 'labs', 'lab', 'technologies', 'technology', 'tech', 'india', 'pvt', 'private',
  'ltd', 'limited', 'llp', 'solutions', 'systems', 'software', 'group', 'ai', 'the',
  'consulting', 'services', 'corp', 'corporation', 'co',
]);

// slug -> jobs adapter, and slug -> the same board-URL shape jobSources.js's
// SLUG_RE expects back out of career_url so the row round-trips correctly.
const PLATFORMS = [
  { ats: 'greenhouse', fetchJobs: greenhouse.fetchJobs, board: (s) => `https://job-boards.greenhouse.io/${s}` },
  { ats: 'lever', fetchJobs: lever.fetchJobs, board: (s) => `https://jobs.lever.co/${s}` },
  { ats: 'ashby', fetchJobs: ashby.fetchJobs, board: (s) => `https://jobs.ashbyhq.com/${s}` },
  { ats: 'smartrecruiters', fetchJobs: smartrecruiters.fetchJobs, board: (s) => `https://careers.smartrecruiters.com/${s}` },
  { ats: 'workable', fetchJobs: workable.fetchJobs, board: (s) => `https://apply.workable.com/${s}` },
];

function slugCandidates(name) {
  const base = name
    .toLowerCase()
    .replace(/\([^)]*\)/g, ' ')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9\s-]/g, ' ')
    .trim();
  const words = base.split(/\s+/).filter(Boolean);
  const stripped = words.filter((w) => !STOPWORDS.has(w));
  const out = new Set();
  const add = (s) => { if (s && s.length > 1) out.add(s); };
  add(words.join(''));
  add(words.join('-'));
  add(stripped.join(''));
  add(stripped.join('-'));
  if (stripped[0]) add(stripped[0]);
  return [...out].slice(0, 5);
}

async function resolveCompany(name) {
  for (const candidate of slugCandidates(name)) {
    for (const platform of PLATFORMS) {
      let jobs;
      try {
        jobs = await platform.fetchJobs({ slug: candidate });
      } catch {
        continue; // 404 / not this platform / transient error -- not evidence either way
      }
      const indiaJobs = jobs.filter((j) => isIndiaLocation(j.location));
      if (indiaJobs.length > 0) {
        return {
          ats: platform.ats,
          careerUrl: platform.board(candidate),
          confidence: `medium (auto-resolved, ${indiaJobs.length}/${jobs.length} listed roles are India-located)`,
        };
      }
    }
  }
  return null;
}

async function pool(items, worker, concurrency) {
  let i = 0;
  const results = new Array(items.length);
  async function run() {
    while (i < items.length) {
      const idx = i++;
      results[idx] = await worker(items[idx], idx);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, run));
  return results;
}

const raw = fs.readFileSync(file, 'utf8');
const rows = parseCsv(raw);
if (!rows.length) {
  console.error('no rows parsed -- check the file path');
  process.exit(1);
}
const header = Object.keys(rows[0]);
const nameField = 'name' in rows[0] ? 'name' : 'Startup' in rows[0] ? 'Startup' : null;
if (!nameField) {
  console.error(`could not find a "name" or "Startup" column -- header was: ${header.join(', ')}`);
  process.exit(1);
}

// A row that's back at needs-resolution *and* carries a note starting
// "ats-guess reverted" means a match was already tried, hand-verified
// wrong, and reverted -- re-guessing would almost certainly rediscover
// the exact same wrong slug (confirmed: BarRaiser -> lever/barraiser did
// exactly this on a rerun). Skip those rather than re-flagging them.
const notesField = 'notes' in rows[0] ? 'notes' : 'Applied? / Notes' in rows[0] ? 'Applied? / Notes' : null;
const wasReverted = (row) => notesField && /^ats-guess reverted/i.test((row[notesField] || '').trim());

const cityField = 'City' in rows[0] ? 'City' : 'city_presence' in rows[0] ? 'city_presence' : null;
let targets = rows.filter((row) => (row.ats || '').trim() === 'needs-resolution' && !wasReverted(row));
if (cityFilter) {
  if (!cityField) {
    console.error(`--city given but no City/city_presence column -- header was: ${header.join(', ')}`);
    process.exit(1);
  }
  targets = targets.filter((row) => (row[cityField] || '').toLowerCase().includes(cityFilter));
}
if (sourceFilter) {
  if (!('source' in rows[0])) {
    console.error(`--source given but no source column -- header was: ${header.join(', ')}`);
    process.exit(1);
  }
  targets = targets.filter((row) => (row.source || '').toLowerCase().includes(sourceFilter));
}
targets = targets.slice(0, limit);

console.log(`${path.basename(file)}: ${rows.length} rows, ${targets.length} unresolved${cityFilter ? ` in "${cityFilter}"` : ''}${sourceFilter ? ` from source~"${sourceFilter}"` : ''} (checking up to ${limit === Infinity ? 'all' : limit})`);

let resolved = 0;
let checked = 0;
const started = Date.now();

await pool(targets, async (row) => {
  const hit = await resolveCompany(row[nameField]);
  checked++;
  if (hit) {
    resolved++;
    row.ats = hit.ats;
    row.career_url = hit.careerUrl;
    row.confidence = hit.confidence;
    console.log(`  ✓ ${row[nameField]} -> ${hit.ats} (${hit.careerUrl})`);
  }
  if (checked % 25 === 0) {
    const elapsedS = Math.round((Date.now() - started) / 1000);
    console.log(`  … ${checked}/${targets.length} checked, ${resolved} resolved, ${elapsedS}s elapsed`);
  }
}, CONCURRENCY);

fs.writeFileSync(file, stringifyCsv(rows, header));
const elapsedS = Math.round((Date.now() - started) / 1000);
console.log(`\nDone in ${elapsedS}s: ${resolved}/${targets.length} newly resolved, written back to ${file}`);
