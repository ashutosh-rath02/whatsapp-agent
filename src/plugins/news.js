import { config } from '../config.js';
import { runDigest } from '../news.js';
import { enabledSources, TIERS } from '../newsSources.js';
import { newsCountBySource } from '../store.js';

export default {
  name: 'news',
  keywords: ['news', 'digest', 'updates'],
  help: '🗞️ `news` — AI digest on demand (auto every morning) · `news sources` — what I watch.',
  order: 45,
  enabled: (config) => config.news.enabled,

  async run(ctx) {
    const sub = (ctx.arg || '').trim().toLowerCase();

    if (sub === 'sources' || sub === 'list') {
      const counts = newsCountBySource();
      const byTier = {};
      for (const s of enabledSources()) (byTier[s.tier] ||= []).push(s);
      const lines = ['🗞️ *Watched sources*'];
      for (const [tier, label] of Object.entries(TIERS)) {
        const rows = byTier[tier];
        if (!rows?.length) continue;
        lines.push('', `*${label}*`, rows.map((s) => `${s.name}${counts[s.id] ? ` (${counts[s.id]})` : ''}`).join(' · '));
      }
      lines.push('', `_Digest daily at ${config.news.digestTime} — or send \`news\` anytime._`);
      await ctx.say(lines.join('\n'));
      return;
    }

    await ctx.react('⏳');
    const digest = await runDigest(); // polls all sources — takes ~15-30s
    if (!digest) {
      await ctx.react('✅');
      await ctx.say('🗞️ Nothing new since the last digest.');
      return;
    }
    await ctx.say(digest.text);
    digest.commit();
    await ctx.react('✅');
  },
};
