// Tolerant RSS/Atom item extraction — dependency-free, like the rest of the
// project. We only need title/link/id/date per item, and real-world feeds are
// messy (CDATA, namespaces, HTML-in-titles), so this favours resilience over
// spec-completeness. A feed that can't be parsed yields [] and is logged by
// the caller, never thrown.
import { decodeEntities } from './html.js';

/** First <tag>…</tag> content in a block, CDATA/entity/tag-stripped. */
function field(block, tag) {
  const m = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i'));
  if (!m) return '';
  let v = m[1].trim();
  const cdata = v.match(/^<!\[CDATA\[([\s\S]*?)\]\]>$/);
  if (cdata) v = cdata[1].trim();
  return decodeEntities(v.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ')).trim();
}

/** Atom <link href="…" rel="alternate"/> — prefer alternate, else first href. */
function atomLink(block) {
  let first = '';
  for (const tag of block.match(/<link\b[^>]*>/gi) || []) {
    const href = (tag.match(/href=["']([^"']+)["']/i) || [])[1];
    if (!href) continue;
    const rel = (tag.match(/rel=["']([^"']+)["']/i) || [])[1];
    if (!rel || rel === 'alternate') return href;
    first ||= href;
  }
  return first;
}

function itemDate(block) {
  for (const tag of ['pubDate', 'published', 'updated', 'dc:date', 'date']) {
    const v = field(block, tag);
    if (v) {
      const ts = Date.parse(v);
      if (!Number.isNaN(ts)) return ts;
    }
  }
  return null;
}

/**
 * Extract items from an RSS 2.0 or Atom document.
 * @returns {Array<{ id: string, title: string, url: string, ts: number|null }>}
 */
export function parseFeed(xml = '', max = 15) {
  const blocks =
    xml.match(/<item[\s>][\s\S]*?<\/item>/gi) || xml.match(/<entry[\s>][\s\S]*?<\/entry>/gi) || [];
  const items = [];
  for (const block of blocks.slice(0, max)) {
    const title = field(block, 'title');
    // RSS <link> has text content; Atom <link> is a self-closing href attr.
    const url = field(block, 'link') || atomLink(block);
    if (!title || !url) continue;
    const id = field(block, 'guid') || field(block, 'id') || url;
    items.push({ id, title, url, ts: itemDate(block) });
  }
  return items;
}
