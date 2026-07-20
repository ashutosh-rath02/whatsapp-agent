// Loads the job-watch company catalog (data/companies.csv +
// data/funded-startups.csv) and normalizes it into pollable targets.
// See docs/JOBS.md for how this data was built and verified.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseCsv } from './csv.js';
import { supported } from './ats/index.js';

const DATA_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data');

// job-boards.greenhouse.io/{slug}, jobs.lever.co/{slug}, jobs.ashbyhq.com/{slug},
// careers.smartrecruiters.com/{slug}, apply.workable.com/api/.../accounts/{slug}
const SLUG_RE = /(?:greenhouse\.io|lever\.co|ashbyhq\.com|smartrecruiters\.com)\/([a-z0-9-]+)|workable\.com\/api\/v1\/widget\/accounts\/([a-z0-9-]+)/i;

function loadCsv(file) {
  const p = path.join(DATA_DIR, file);
  try {
    return parseCsv(fs.readFileSync(p, 'utf8'));
  } catch {
    return [];
  }
}

function toCompany(row, nameField) {
  const ats = (row.ats || '').trim();
  if (!supported(ats)) return null; // needs-resolution / custom / unresolved ATS (successfactors, phenom)
  const careerUrl = (row.career_url || '').trim();
  if (!careerUrl) return null;
  const slugMatch = careerUrl.match(SLUG_RE);
  const slug = slugMatch ? (slugMatch[1] || slugMatch[2]) : null;
  // workday/oracle-hcm derive tenant/site/host from careerUrl directly (see their adapters) — no slug needed.
  if (!slug && ats !== 'workday' && ats !== 'oracle-hcm') return null;
  return {
    name: row[nameField],
    ats,
    slug,
    careerUrl,
    confidence: row.confidence || 'high',
  };
}

let cache = null;

export function loadCompanies() {
  if (cache) return cache;
  const master = loadCsv('companies.csv').map((r) => toCompany(r, 'name')).filter(Boolean);
  const startups = loadCsv('funded-startups.csv').map((r) => toCompany(r, 'Startup')).filter(Boolean);
  const seen = new Set();
  cache = [...master, ...startups].filter((c) => {
    const key = `${c.ats}:${c.slug || c.careerUrl}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return cache;
}
