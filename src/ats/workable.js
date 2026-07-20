import { fetchText } from '../html.js';

export async function fetchJobs({ slug }) {
  const res = await fetchText(`https://apply.workable.com/api/v1/widget/accounts/${slug}`, { timeout: 12000 });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = JSON.parse(res.text);
  return (data.jobs || []).map((j) => ({
    id: j.shortcode || String(j.id || ''),
    title: j.title,
    url: j.url || j.application_url || `https://apply.workable.com/${slug}/j/${j.shortcode}`,
    location: [j.city, j.country].filter(Boolean).join(', '),
  }));
}
