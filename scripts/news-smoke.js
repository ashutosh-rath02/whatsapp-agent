// Offline test of the news feature: feed parsing (RSS2/Atom/CDATA fixtures),
// store dedup, and digest building. No network, no WhatsApp, no LLM.
//   node scripts/news-smoke.js
import path from 'node:path';
import os from 'node:os';

process.env.DB_PATH = path.join(os.tmpdir(), `wa-news-smoke-${Date.now()}.json`);
process.env.NEWS_LLM_PICKS = 'false'; // keep the smoke offline
process.env.AGENT_TZ = process.env.AGENT_TZ || 'Asia/Kolkata';

const { parseFeed } = await import('../src/feeds.js');
const { buildDigest } = await import('../src/news.js');
const store = await import('../src/store.js');
const { SOURCES, enabledSources } = await import('../src/newsSources.js');

let failures = 0;
const expect = (cond, what) => {
  console.log(`  ${cond ? '✓' : '✗ FAILED:'} ${what}`);
  if (!cond) failures++;
};

console.log('— parseFeed: RSS 2.0 —');
const rss = `<?xml version="1.0"?><rss version="2.0"><channel><title>X</title>
  <item><title>Plain title</title><link>https://a.com/1</link><guid>g1</guid>
    <pubDate>Sat, 18 Jul 2026 10:00:00 GMT</pubDate></item>
  <item><title><![CDATA[CDATA &amp; <b>HTML</b> title]]></title><link>https://a.com/2</link></item>
</channel></rss>`;
const r = parseFeed(rss);
expect(r.length === 2, `2 items parsed (got ${r.length})`);
expect(r[0].id === 'g1' && r[0].url === 'https://a.com/1', 'guid + link extracted');
expect(typeof r[0].ts === 'number', 'pubDate parsed to timestamp');
expect(r[1].title === 'CDATA & HTML title', `CDATA/entities/tags stripped (got "${r[1].title}")`);

console.log('— parseFeed: Atom —');
const atom = `<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom">
  <entry><title>Atom entry</title><id>tag:1</id>
    <link rel="self" href="https://b.com/self.xml"/><link rel="alternate" href="https://b.com/post"/>
    <updated>2026-07-18T12:00:00Z</updated></entry>
</feed>`;
const a = parseFeed(atom);
expect(a.length === 1, '1 entry parsed');
expect(a[0].url === 'https://b.com/post', `rel=alternate link chosen over rel=self (got ${a[0].url})`);
expect(a[0].id === 'tag:1', 'atom id extracted');

console.log('— parseFeed: garbage —');
expect(parseFeed('<html>not a feed</html>').length === 0, 'non-feed → [] (no throw)');
expect(parseFeed('').length === 0, 'empty → []');

console.log('— catalog sanity —');
const ids = new Set(SOURCES.map((s) => s.id));
expect(ids.size === SOURCES.length, `source ids unique (${SOURCES.length} sources)`);
expect(SOURCES.every((s) => ['rss', 'scrape', 'hn'].includes(s.kind)), 'every source has a known kind');
expect(SOURCES.every((s) => s.kind !== 'scrape' || (s.linkRe && s.base)), 'scrape sources have linkRe + base');
process.env.NEWS_SOURCES_DISABLED = 'hn,verge';
expect(enabledSources().length === SOURCES.length - 2, 'NEWS_SOURCES_DISABLED filters');
process.env.NEWS_SOURCES_DISABLED = '';

console.log('— store: news dedup —');
const mk = (k, extra = {}) => ({
  key: k, source: 'openai', sourceName: 'OpenAI', tier: 'labs', star: true,
  title: `Item ${k}`, url: `https://x.com/${k}`, ts: Date.now(), ...extra,
});
expect(store.addNews([mk('a'), mk('b')]).length === 2, 'two new items stored');
expect(store.addNews([mk('a'), mk('c')]).length === 1, 'duplicate key skipped, new one stored');
expect(store.pendingNews().length === 3, '3 pending');

console.log('— digest build —');
store.addNews([
  mk('d', { source: 'simonw', sourceName: 'Simon Willison', tier: 'voices' }),
  mk('e', { source: 'hn', sourceName: 'Hacker News', tier: 'community', star: true }),
]);
const digest = await buildDigest();
expect(digest !== null, 'digest built');
expect(digest.text.includes('AI digest'), 'has header');
expect(digest.text.includes('🧪') && digest.text.includes('✍️'), 'tier sections present');
expect(digest.keys.length === 5, `all 5 pending keys settled (got ${digest.keys.length})`);
store.markNewsDigested(digest.keys);
expect(store.pendingNews().length === 0, 'digested items no longer pending');
expect((await buildDigest()) === null, 'nothing pending → null (no empty digest)');

console.log('— per-source cap —');
store.addNews(Array.from({ length: 8 }, (_, i) => mk(`cap${i}`, { star: false })));
const d2 = await buildDigest();
const shown = (d2.text.match(/• OpenAI:/g) || []).length;
expect(shown === 2, `non-star source capped at 2 in digest (got ${shown})`);
expect(d2.keys.length === 8, 'capped-out items still settled (never re-reported)');

console.log(failures === 0 ? '\nAll good ✅' : `\n${failures} check(s) FAILED ❌`);
process.exit(failures === 0 ? 0 : 1);
