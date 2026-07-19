import { relTime, trunc } from '../format.js';
import * as store from '../store.js';

export default {
  name: 'list',
  keywords: ['list', 'recent', 'ls', 'all'],
  help: '🗂️ `list` — show saved items + reminders.',
  order: 40,

  async run(ctx) {
    const items = store.listItems(10);
    const rem = store.pendingReminders(10);
    const lines = ['🗂️ *Your stuff*'];
    if (rem.length) {
      lines.push('', '*⏰ Reminders*');
      for (const r of rem) lines.push(`R${r.id} · ${relTime(r.dueAt)} — ${trunc(r.content || '(no note)', 45)}`);
    }
    if (items.length) {
      lines.push('', '*📌 Saved*');
      for (const i of items) lines.push(`#${i.id} · ${trunc(i.title || i.content, 50)}`);
    }
    if (!items.length && !rem.length) {
      lines.push('', '_(nothing yet — try `save <note>` or `remind me in 1h: …`)_');
    }
    lines.push('', '_`done <#id>` clears · `cancel <Rid>` drops a reminder_');
    await ctx.say(lines.join('\n'));
  },
};
