import { config } from './config.js';
import { log } from './logger.js';

/**
 * Web research via Tavily. Returns { ok, answer, results[] } where each result
 * is { title, url, content }. When no Tavily key is configured, returns
 * { ok: false, reason } so the caller can degrade gracefully.
 */
export async function research(query) {
  const key = config.research.tavilyApiKey;
  if (!key) return { ok: false, reason: 'no TAVILY_API_KEY', results: [] };
  if (!query || !query.trim()) return { ok: false, reason: 'empty query', results: [] };

  const payload = JSON.stringify({
    api_key: key,
    query: query.slice(0, 380),
    search_depth: 'advanced',
    include_answer: true,
    max_results: config.research.maxResults,
  });

  let lastErr;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch('https://api.tavily.com/search', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: payload,
      });

      if (!res.ok) {
        const body = await res.text().catch(() => '');
        log.warn('Tavily error', res.status, body.slice(0, 200));
        return { ok: false, reason: `tavily ${res.status}`, results: [] };
      }

      const data = await res.json();
      const results = (data.results || []).map((r) => ({
        title: r.title || '',
        url: r.url || '',
        content: (r.content || '').slice(0, 1200),
      }));
      return { ok: true, answer: data.answer || '', results };
    } catch (err) {
      lastErr = err;
      log.debug(`research() attempt ${attempt} failed:`, err?.message);
      await new Promise((r) => setTimeout(r, attempt * 700));
    }
  }
  log.warn('research() failed after retries', lastErr?.message);
  return { ok: false, reason: lastErr?.message || 'network error', results: [] };
}
