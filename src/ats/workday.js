import { fetchText } from '../html.js';

// e.g. https://nvidia.wd5.myworkdayjobs.com/NVIDIAExternalCareerSite
const WORKDAY_RE = /https?:\/\/([a-z0-9-]+)\.(wd\d+)\.myworkdayjobs\.com\/([^/?#]+)/i;

export async function fetchJobs({ careerUrl }) {
  const m = careerUrl.match(WORKDAY_RE);
  if (!m) throw new Error('not a myworkdayjobs.com URL — tenant/site not derivable');
  const [, tenant, wd, site] = m;
  const pageUrl = `https://${tenant}.${wd}.myworkdayjobs.com/${site}`;

  // Workday tightened bot detection again: Origin/Referer headers alone (the
  // prior fix) stopped being enough and every request started 400ing, even
  // for tenants confirmed working earlier -- it now also checks for a
  // session cookie that's only ever handed out by loading the career page
  // first. So load the page (throwaway, just for its Set-Cookie) before the
  // real API call.
  const page = await fetchText(pageUrl, { timeout: 12000 });
  const cookies = page.headers?.getSetCookie ? page.headers.getSetCookie() : [];
  const cookieHeader = cookies.map((c) => c.split(';')[0]).join('; ');

  const api = `https://${tenant}.${wd}.myworkdayjobs.com/wday/cxs/${tenant}/${site}/jobs`;
  const res = await fetchText(api, {
    timeout: 12000,
    headers: {
      'content-type': 'application/json',
      accept: 'application/json',
      origin: pageUrl,
      referer: pageUrl,
      ...(cookieHeader && { cookie: cookieHeader }),
    },
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
