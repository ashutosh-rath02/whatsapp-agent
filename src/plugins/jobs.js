import { config } from '../config.js';
import { runJobsCycle } from '../jobs.js';
import { loadCompanies } from '../jobSources.js';

export default {
  name: 'jobs',
  keywords: ['jobs', 'job', 'opportunities'],
  help: '💼 `jobs` — poll now for new postings (auto every ~25 min) · `jobs sources` — companies watched.',
  order: 46,
  enabled: (config) => config.jobs.enabled,

  async run(ctx) {
    const sub = (ctx.arg || '').trim().toLowerCase();

    if (sub === 'sources' || sub === 'list') {
      const companies = loadCompanies();
      const byAts = {};
      for (const c of companies) (byAts[c.ats] ||= []).push(c.name);
      const lines = [`💼 *Watching ${companies.length} companies*`, ''];
      for (const [ats, names] of Object.entries(byAts)) {
        lines.push(`*${ats}* (${names.length})`, names.slice(0, 12).join(' · ') + (names.length > 12 ? ` · +${names.length - 12} more` : ''), '');
      }
      lines.push(`_Polls every ~${Math.round(config.jobs.pollMs / 60000)} min for software/full-stack/backend/frontend/AI/FDE roles._`);
      await ctx.say(lines.join('\n').trim());
      return;
    }

    await ctx.react('⏳');
    const cycle = await runJobsCycle();
    if (!cycle) {
      await ctx.react('✅');
      await ctx.say('💼 Nothing new right now.');
      return;
    }
    await ctx.say(cycle.text);
    cycle.commit();
    await ctx.react('✅');
  },
};
