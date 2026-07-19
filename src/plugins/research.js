import { processMessage } from '../pipeline.js';
import { log } from '../logger.js';

// The default: anything without a recognised keyword lands here.
export default {
  name: 'research',
  keywords: ['ask', 'research', 'explore'],
  help: '🔎 _(default)_ paste a link/note → I research & reply with sources.',
  order: 10,
  fallback: true,

  async run(ctx) {
    const input = ctx.explicit ? ctx.arg : ctx.raw;
    if (ctx.explicit && !input.trim()) {
      await ctx.say('🔎 Send `ask <link or question>`.');
      return;
    }
    await ctx.react('⏳');
    const { reply, meta } = await processMessage(input);
    log.info('  ↳ done', meta);
    await ctx.say(reply);
    await ctx.react('✅');
  },
};
