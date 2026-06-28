import { extract as extractArticle } from '@extractus/article-extractor';
import { log } from './logger.js';

// Matches http/https URLs in a blob of text.
const URL_RE = /https?:\/\/[^\s<>()]+[^\s<>().,!?'"]/gi;

export function findUrls(text = '') {
  const matches = text.match(URL_RE) || [];
  // de-dupe, preserve order
  return [...new Set(matches)];
}

/**
 * Strip URLs out of a message to recover any commentary the user added.
 */
export function textWithoutUrls(text = '') {
  return text.replace(URL_RE, '').replace(/\s+/g, ' ').trim();
}

/**
 * Fetch + parse the main readable content of a URL.
 * Returns { url, ok, title, author, published, text, excerpt, source } — `ok`
 * is false (with a `reason`) when extraction fails (paywall, JS-only, blocked).
 */
export async function extractUrl(url) {
  try {
    const article = await extractArticle(url, {}, {
      // a desktop UA helps with sites that gate bots
      headers: {
        'user-agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
      },
    });
    if (!article || !article.content) {
      return { url, ok: false, reason: 'no readable content extracted' };
    }
    const text = htmlToText(article.content);
    return {
      url,
      ok: true,
      title: article.title || '',
      author: article.author || '',
      published: article.published || '',
      source: article.source || hostOf(url),
      excerpt: article.description || '',
      text: text.slice(0, 12000), // cap to keep prompts sane
    };
  } catch (err) {
    log.debug('extractUrl failed', url, err?.message);
    return { url, ok: false, reason: err?.message || 'fetch/parse error' };
  }
}

function htmlToText(html = '') {
  return html
    .replace(/<\s*(script|style)[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, '')
    .replace(/<\/(p|div|h[1-6]|li|br)\s*>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

export function hostOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}
