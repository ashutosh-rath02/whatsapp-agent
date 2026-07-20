import { fetchText } from '../html.js';

export async function fetchJobs({ slug }) {
  const res = await fetchText(`https://api.ashbyhq.com/posting-api/job-board/${slug}`, { timeout: 12000 });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = JSON.parse(res.text);
  return (data.jobs || []).map((j) => ({
    id: j.id,
    title: j.title,
    url: j.jobUrl || j.applyUrl || `https://jobs.ashbyhq.com/${slug}/${j.id}`,
    location: j.location || j.locationName || '',
  }));
}
