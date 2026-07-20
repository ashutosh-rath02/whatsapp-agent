import { fetchText } from '../html.js';

// e.g. https://nvidia.wd5.myworkdayjobs.com/NVIDIAExternalCareerSite
const WORKDAY_RE = /https?:\/\/([a-z0-9-]+)\.(wd\d+)\.myworkdayjobs\.com\/([^/?#]+)/i;

export async function fetchJobs({ careerUrl }) {
  const m = careerUrl.match(WORKDAY_RE);
  if (!m) throw new Error('not a myworkdayjobs.com URL — tenant/site not derivable');
  const [, tenant, wd, site] = m;
  const api = `https://${tenant}.${wd}.myworkdayjobs.com/wday/cxs/${tenant}/${site}/jobs`;
  const res = await fetchText(api, {
    timeout: 12000,
    headers: { 'content-type': 'application/json' },
    method: 'POST',
    body: JSON.stringify({ appliedFacets: {}, limit: 50, offset: 0, searchText: '' }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = JSON.parse(res.text);
  return (data.jobPostings || []).map((j) => ({
    id: j.externalPath,
    title: j.title,
    url: `https://${tenant}.${wd}.myworkdayjobs.com/${site}${j.externalPath}`,
    location: j.locationsText || '',
  }));
}
