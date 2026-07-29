import { fetchText } from '../html.js';

// The region/pod segment between "fa." and "oraclecloud.com" isn't always
// present -- e.g. JPMorgan's real host is jpmc.fa.oraclecloud.com, with
// nothing between "fa." and ".oraclecloud.com", while others use a segment
// like "fa.ocs.oraclecloud.com". Make it optional rather than required.
const HOST_RE = /https?:\/\/([a-z0-9-]+\.fa\.(?:[a-z0-9-]+\.)?oraclecloud\.com)/i;
const SITE_RE = /\/sites\/([^/?#]+)/i;

/**
 * Oracle Fusion Recruiting Cloud has no stable public host per company — the
 * public-facing careers.{company}.com page redirects to a tenant-specific
 * *.fa.{region}.oraclecloud.com host (and often a /sites/{siteNumber}
 * segment identifying which career site). Neither is guessable from the
 * company name, so this resolves both by following the real redirect at
 * request time rather than hardcoding a host we scraped once.
 */
export async function fetchJobs({ careerUrl }) {
  let host = (careerUrl.match(HOST_RE) || [])[1];
  let siteNumber = (careerUrl.match(SITE_RE) || [])[1];

  if (!host) {
    const res = await fetchText(careerUrl, { timeout: 10000 });
    const finalUrl = res.finalUrl || careerUrl;
    host = (finalUrl.match(HOST_RE) || [])[1] || (res.text.match(HOST_RE) || [])[1];
    siteNumber = siteNumber || (finalUrl.match(SITE_RE) || [])[1] || (res.text.match(SITE_RE) || [])[1];
  }
  if (!host || !siteNumber) throw new Error('could not resolve Oracle HCM host/siteNumber');

  const api =
    `https://${host}/hcmRestApi/resources/latest/recruitingCEJobRequisitions` +
    `?onlyData=true&expand=requisitionList&finder=findReqs;siteNumber=${encodeURIComponent(siteNumber)},limit=50,offset=0`;
  const res = await fetchText(api, { timeout: 12000 });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = JSON.parse(res.text);
  const reqs = data.items?.[0]?.requisitionList || [];
  return reqs.map((r) => ({
    id: String(r.Id || r.RequisitionNumber || ''),
    title: r.Title || '',
    url: r.ExternalURL || `https://${host}/hcmUI/CandidateExperience/en/sites/${siteNumber}/job/${r.Id}`,
    location: r.PrimaryLocation || '',
  }));
}
