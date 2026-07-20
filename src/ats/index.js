import * as greenhouse from './greenhouse.js';
import * as lever from './lever.js';
import * as ashby from './ashby.js';
import * as smartrecruiters from './smartrecruiters.js';
import * as workable from './workable.js';
import * as workday from './workday.js';
import * as oracle from './oracle.js';

// SuccessFactors and Phenom are detected in the catalog (10 companies) but
// have no adapter yet — their public endpoints need per-company discovery
// that slug-guessing couldn't reliably do (see docs/JOBS.md). Polling them
// is a silent no-op rather than a crash until an adapter lands.
// 'oracle-hcm' is the id used in data/*.csv (matches the ats-column label
// from the original probe); the adapter module itself is named 'oracle'.
export const ADAPTERS = { greenhouse, lever, ashby, smartrecruiters, workable, workday, 'oracle-hcm': oracle };

export function supported(ats) {
  return ats in ADAPTERS;
}

/** @returns {Promise<Array<{id,title,url,location}>>} */
export function fetchJobs(company) {
  const adapter = ADAPTERS[company.ats];
  if (!adapter) return Promise.resolve([]);
  return adapter.fetchJobs(company);
}
