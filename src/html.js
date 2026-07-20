// Small shared HTML/HTTP helpers used by the web + social extractors.

export const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

/**
 * Fetch a URL as text with a browser-like UA and a hard timeout.
 * @returns {Promise<{ ok: boolean, status: number, text: string, finalUrl: string }>}
 */
export async function fetchText(url, { timeout = 15000, headers = {}, method = 'GET', body } = {}) {
  const ctrl = new AbortController();
  const to = setTimeout(() => ctrl.abort(), timeout);
  try {
    const res = await fetch(url, {
      method,
      body,
      headers: {
        'user-agent': BROWSER_UA,
        'accept-language': 'en-US,en;q=0.9',
        accept: 'text/html,application/json,*/*',
        ...headers,
      },
      redirect: 'follow',
      signal: ctrl.signal,
    });
    const text = await res.text();
    return { ok: res.ok, status: res.status, text, finalUrl: res.url };
  } finally {
    clearTimeout(to);
  }
}

export function stripTags(html = '') {
  return html
    .replace(/<\s*(script|style)[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, '')
    .replace(/<\/(p|div|h[1-6]|li|br)\s*>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

export function decodeEntities(s = '') {
  return s
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => safeCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => safeCodePoint(parseInt(d, 10)));
}

function safeCodePoint(n) {
  try {
    return String.fromCodePoint(n);
  } catch {
    return '';
  }
}

/**
 * Pull Open Graph / meta tags out of an HTML string (attribute order agnostic).
 * @returns {Record<string,string>} e.g. { 'og:title': '…', 'og:description': '…' }
 */
export function parseOgMeta(html = '') {
  const out = {};
  const add = (k, v) => {
    if (k && v && out[k] === undefined) out[k] = decodeEntities(v);
  };
  const reA =
    /<meta[^>]+(?:property|name)=["']([^"']+)["'][^>]+content=["']([^"']*)["'][^>]*>/gi;
  const reB =
    /<meta[^>]+content=["']([^"']*)["'][^>]+(?:property|name)=["']([^"']+)["'][^>]*>/gi;
  let m;
  while ((m = reA.exec(html))) add(m[1], m[2]);
  while ((m = reB.exec(html))) add(m[2], m[1]);
  return out;
}
