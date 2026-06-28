import { extract as extractArticle } from '@extractus/article-extractor';
import { log } from './logger.js';
import { BROWSER_UA, fetchText, stripTags, decodeEntities, parseOgMeta } from './html.js';
import { classifyUrl, extractTweet, extractInstagram } from './social.js';

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
 * Explore a single URL. Dispatches to a platform-specific extractor for
 * Twitter/X and Instagram (which block generic extraction), otherwise reads
 * the page as an article. Returns a normalized record; `ok:false` carries a
 * `reason` when nothing usable could be extracted.
 */
export async function extractUrl(url) {
  const kind = classifyUrl(url);
  if (kind === 'twitter') return extractTweet(url);
  if (kind === 'instagram') return extractInstagram(url);
  return extractArticleUrl(url);
}

async function extractArticleUrl(url) {
  try {
    const article = await extractArticle(url, {}, { headers: { 'user-agent': BROWSER_UA } });
    if (article?.content) {
      const text = decodeEntities(stripTags(article.content));
      return {
        url,
        ok: true,
        kind: 'article',
        title: article.title || '',
        author: article.author || '',
        published: article.published || '',
        source: article.source || hostOf(url),
        excerpt: article.description || '',
        text: text.slice(0, 12000), // cap to keep prompts sane
      };
    }
    return ogFallback(url, 'no readable content extracted');
  } catch (err) {
    log.debug('extractArticleUrl failed', url, err?.message);
    return ogFallback(url, err?.message || 'fetch/parse error');
  }
}

/**
 * When full article extraction fails (paywall, JS-only, bot-gated), salvage
 * the page's Open Graph title/description so we still have something to work
 * with instead of nothing.
 */
async function ogFallback(url, reason) {
  try {
    const { ok, status, text } = await fetchText(url);
    if (ok) {
      const og = parseOgMeta(text);
      const title = og['og:title'] || '';
      const desc = og['og:description'] || '';
      if (title || desc) {
        return {
          url,
          ok: true,
          kind: 'article',
          title,
          source: og['og:site_name'] || hostOf(url),
          text: [title, desc].filter(Boolean).join('\n').slice(0, 4000),
          partial: true,
          note: `meta-only (${reason})`,
        };
      }
    }
    return { url, ok: false, reason: ok ? reason : `${reason} (http ${status})` };
  } catch (e) {
    return { url, ok: false, reason: `${reason}; og fallback failed: ${e?.message}` };
  }
}

export function hostOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}
