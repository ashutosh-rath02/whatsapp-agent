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
    lines.push(
      '📍 `here` — sent in a WhatsApp group with just you in it, redirects reminders/jobs/news there instead of self-chat (self-chats don\'t always notify). Send `here` again in self-chat to switch back.',
      '   _If it can\'t verify the group\'s members (a known WhatsApp Web bug), it\'ll tell you — send `here confirm` to register it anyway once you\'re sure it\'s just you._',
    );
    await ctx.say(lines.join('\n'));
  },
};
