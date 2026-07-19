import { findUrls } from '../extract.js';
import * as store from '../store.js';
import { makeTitle } from './_helpers.js';

export default {
  name: 'save',
  keywords: ['save', 'store', 'keep'],
  help: '📌 `save <link/note>` — just store it, no research.',
  order: 20,

  async run(ctx) {
    const content = (ctx.arg || '').trim();
    if (!content) {
      await ctx.say('📌 Nothing to save — try `save <link or note>`.');
      return;
    }
    const url = findUrls(content)[0] || null;
    const title = makeTitle(content, url);
    const { item, duplicate } = store.saveItem({
      msgId: ctx.msg.id?._serialized,
      content,
      url,
      title,
    });
    await ctx.react('📌');
    await ctx.say(
      `📌 *Saved* #${item.id}${duplicate ? ' _(already had it)_' : ''}\n${title}` +
        `\n\n_View everything on the dashboard, or \`list\` here._`,
    );
  },
};
