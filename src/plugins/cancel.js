import { cancelReminderById } from './_helpers.js';

export default {
  name: 'cancel',
  keywords: ['cancel'],
  help: '🗑️ `cancel <Rid>` — drop a reminder.',
  order: 70,
  enabled: (config) => config.reminders.enabled,

  async run(ctx) {
    const id = Number((String(ctx.arg || '').match(/\d+/) || [])[0]);
    if (!id) {
      await ctx.say('Use `cancel <Rid>` — see `list`.');
      return;
    }
    return cancelReminderById(ctx, id);
  },
};
