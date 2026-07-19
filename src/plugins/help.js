export default {
  name: 'help',
  keywords: ['help', 'commands', 'menu'],
  help: '❓ `help` — this message.',
  order: 999,

  // Built from whatever is actually loaded, so it can never drift from reality.
  async run(ctx) {
    const lines = ['🤖 *Agent commands* — send these to this chat:', ''];
    for (const p of ctx.registry.list()) {
      if (p.help) lines.push(p.help);
    }
    await ctx.say(lines.join('\n'));
  },
};
