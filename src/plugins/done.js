import * as store from '../store.js';
import { cancelReminderById } from './_helpers.js';

export default {
  name: 'done',
  keywords: ['done', 'delete', 'del', 'rm', 'clear'],
  help: '✅ `done <#id>` — clear a saved item.',
  order: 60,

  async run(ctx) {
    const raw = (ctx.arg || '').trim();
    const rMatch = raw.match(/^r\s*#?(\d+)/i); // "done R2" → cancel reminder
    if (rMatch) return cancelReminderById(ctx, Number(rMatch[1]));
    const id = Number((raw.match(/\d+/) || [])[0]);
    if (!id) {
      await ctx.say('Use `done <#id>` — see `list`.');
      return;
    }
    const ok = store.removeItem(id);
    await ctx.say(ok ? `✅ Cleared #${id}.` : `🤷 No open item #${id}.`);
  },
};
