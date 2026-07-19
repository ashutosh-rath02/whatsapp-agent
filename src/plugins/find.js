import { trunc } from '../format.js';
import * as store from '../store.js';

export default {
  name: 'find',
  keywords: ['find', 'search'],
  help: '🔍 `find <text>` — search saved items.',
  order: 50,

  async run(ctx) {
    const q = (ctx.arg || '').trim();
    if (!q) {
      await ctx.say('🔍 `find <text>` — what should I look for?');
      return;
    }
    const hits = store.findItems(q, 10);
    if (!hits.length) {
      await ctx.say(`🔍 No saved items match “${q}”.`);
      return;
    }
    const lines = [`🔍 *Matches for “${q}”*`];
    for (const i of hits) {
      lines.push(`#${i.id} · ${trunc(i.title || i.content, 50)}${i.url ? `\n   ${i.url}` : ''}`);
    }
    await ctx.say(lines.join('\n'));
  },
};
