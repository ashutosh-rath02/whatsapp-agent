import { fetchText } from '../html.js';

export async function fetchJobs({ slug }) {
  const res = await fetchText(
    `https://api.smartrecruiters.com/v1/companies/${slug}/postings?limit=100`,
    { timeout: 12000 },
  );
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = JSON.parse(res.text);
  return (data.content || []).map((j) => ({
    id: j.id,
    title: j.name,
    url: `https://jobs.smartrecruiters.com/${slug}/${j.id}`,
    location: j.location?.fullLocation || [j.location?.city, j.location?.region].filter(Boolean).join(', '),
  }));
}
