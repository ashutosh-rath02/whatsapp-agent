import { fetchText } from '../html.js';

export async function fetchJobs({ slug }) {
  const res = await fetchText(`https://boards-api.greenhouse.io/v1/boards/${slug}/jobs?content=false`, {
    timeout: 12000,
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = JSON.parse(res.text);
  return (data.jobs || []).map((j) => ({
    id: String(j.id),
    title: j.title,
    url: j.absolute_url,
    location: j.location?.name || '',
  }));
}
