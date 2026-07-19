import { parseReminder } from '../commands.js';
import { config } from '../config.js';
import { relTime, fmtAbsolute } from '../format.js';
import * as store from '../store.js';

export default {
  name: 'remind',
  keywords: ['remind', 'reminder', 'remindme'],
  help: '⏰ `remind me <when>: <note>` — e.g. `in 2h: …`, `tomorrow 9am: …`.',
  order: 30,
  enabled: (config) => config.reminders.enabled,

  async run(ctx) {
    const parsed = parseReminder(ctx.arg);
    if (!parsed.ok) {
      await ctx.react('❓');
      await ctx.say(
        `⏰ ${parsed.reason}\nTry: \`remind me in 2h: ping Sam\` or \`remind me tomorrow 9am: review PR\`.`,
      );
      return;
    }
    if (parsed.dueAt <= Date.now() + 1000) {
      await ctx.say('⏰ That time looks like it’s already past — give me a future time.');
      return;
    }
    const { reminder, duplicate } = store.addReminder({
      msgId: ctx.msg.id?._serialized,
      content: parsed.content,
      dueAt: parsed.dueAt,
    });
    await ctx.react('⏰');
    const when = `${relTime(parsed.dueAt)} (${fmtAbsolute(parsed.dueAt, config.agent.timezone)})`;
    await ctx.say(
      `⏰ *Reminder set* R${reminder.id}${duplicate ? ' _(already set)_' : ''}\n${when}\n${parsed.content || '_(no note)_'}`,
    );
  },
};
