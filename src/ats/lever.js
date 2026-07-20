import { fetchText } from '../html.js';

export async function fetchJobs({ slug }) {
  const res = await fetchText(`https://api.lever.co/v0/postings/${slug}?mode=json`, { timeout: 12000 });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = JSON.parse(res.text);
  if (!Array.isArray(data)) return [];
  return data.map((j) => ({
    id: j.id,
    title: j.text,
    url: j.hostedUrl,
    location: j.categories?.location || '',
  }));
}
