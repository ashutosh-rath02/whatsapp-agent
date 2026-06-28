// Specialized extractors for Twitter/X and Instagram — the platforms that
// block ordinary article extraction. Each returns the same shape as
// extract.js's extractUrl: { url, ok, title, author, source, text, kind, ... }.
import { fetchText, parseOgMeta } from './html.js';
import { log } from './logger.js';

const TWITTER_HOSTS = new Set([
  'twitter.com',
  'x.com',
  'mobile.twitter.com',
  'mobile.x.com',
  'fxtwitter.com',
  'vxtwitter.com',
  'nitter.net',
]);
const INSTAGRAM_HOSTS = new Set(['instagram.com', 'instagr.am', 'ddinstagram.com']);

export function classifyUrl(url) {
  let host;
  try {
    host = new URL(url).hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return 'web';
  }
  if (TWITTER_HOSTS.has(host)) return 'twitter';
  if (INSTAGRAM_HOSTS.has(host)) return 'instagram';
  return 'web';
}

// ───────────────────────── Twitter / X ─────────────────────────

function tweetId(url) {
  const m = url.match(/status(?:es)?\/(\d+)/);
  return m ? m[1] : null;
}

export async function extractTweet(url) {
  const id = tweetId(url);
  if (!id) return { url, ok: false, reason: 'no tweet id in URL' };
  try {
    // fxtwitter exposes a clean JSON API — no scraping, no auth.
    const { ok, status, text } = await fetchText(`https://api.fxtwitter.com/status/${id}`);
    if (!ok) return { url, ok: false, reason: `fxtwitter ${status}` };

    const t = JSON.parse(text)?.tweet;
    if (!t) return { url, ok: false, reason: 'no tweet in fxtwitter response' };

    const author = t.author?.name
      ? `${t.author.name} (@${t.author.screen_name})`
      : '';
    let body = t.text || '';
    if (t.quote?.text) {
      const q = t.quote.author?.screen_name ? `@${t.quote.author.screen_name}` : 'tweet';
      body += `\n\n↪ Quoting ${q}: ${t.quote.text}`;
    }
    const media = mediaSummary(t.media);
    const stats = `❤ ${t.likes ?? '?'} · 🔁 ${t.retweets ?? '?'} · 💬 ${t.replies ?? '?'}`;

    return {
      url,
      ok: true,
      kind: 'tweet',
      title: author ? `Tweet by ${author}` : 'Tweet',
      author,
      source: 'x.com',
      published: t.created_at || '',
      text: [body, media, `(${stats})`].filter(Boolean).join('\n\n').slice(0, 8000),
    };
  } catch (e) {
    log.debug('extractTweet failed', e?.message);
    return { url, ok: false, reason: e?.message || 'tweet fetch error' };
  }
}

function mediaSummary(media) {
  if (!media) return '';
  const parts = [];
  if (media.photos?.length) parts.push(`[${media.photos.length} image(s)]`);
  if (media.videos?.length) {
    const v = media.videos[0];
    parts.push(`[video${v?.duration ? ` ${Math.round(v.duration)}s` : ''}]`);
  }
  return parts.join(' ');
}

// ───────────────────────── Instagram ─────────────────────────

// Instagram serves Open Graph caption/metadata to whitelisted link-preview
// crawlers (logged-out browsers get a login wall, but this UA does not).
const CRAWLER_UA =
  'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)';

function igShortcode(url) {
  const m = url.match(/instagram\.com\/(?:[^/]+\/)?(?:p|reel|reels|tv)\/([A-Za-z0-9_-]+)/i);
  return m ? m[1] : null;
}

export async function extractInstagram(url) {
  const code = igShortcode(url);
  if (!code) return { url, ok: false, reason: 'no Instagram shortcode in URL' };

  const canonical = `https://www.instagram.com/p/${code}/`;
  try {
    const { ok, status, text } = await fetchText(canonical, {
      headers: { 'user-agent': CRAWLER_UA },
    });
    if (!ok) return { url, ok: false, reason: `instagram http ${status}` };

    const og = parseOgMeta(text);
    const title = og['og:title'] || '';
    const desc = og['og:description'] || '';
    // A login wall collapses to a bare "Instagram" title with no description.
    if (!desc && /^\s*instagram\s*$/i.test(title)) {
      return { url, ok: false, reason: 'instagram login-walled (no caption)' };
    }
    if (!title && !desc) {
      return { url, ok: false, reason: 'no instagram metadata' };
    }

    // og:description carries engagement + date + caption, e.g.
    // '60M likes, 4M comments - world_record_egg on January 4, 2019: "…"'
    const handle = (desc.match(/-\s*([A-Za-z0-9._]+)\s+on\s+[A-Z]/) || [])[1] || '';
    return {
      url,
      ok: true,
      kind: 'instagram',
      title: title || 'Instagram post',
      author: handle ? `@${handle}` : '',
      source: 'instagram.com',
      text: [title, desc].filter(Boolean).join('\n').slice(0, 8000),
      note: 'caption/metadata only — video & spoken audio not transcribed (Phase 2b)',
    };
  } catch (e) {
    log.debug('extractInstagram failed', e?.message);
    return { url, ok: false, reason: e?.message || 'instagram fetch error' };
  }
}
