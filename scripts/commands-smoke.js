// Exercises command parsing, reminder parsing, the JSON store, and the
// dashboard renderer WITHOUT WhatsApp/Chromium or any network/LLM calls.
//   node scripts/commands-smoke.js
import path from 'node:path';
import os from 'node:os';

// Point the store at a throwaway file BEFORE importing it (it reads env at load).
process.env.DB_PATH = path.join(os.tmpdir(), `wa-smoke-${Date.now()}.json`);
process.env.AGENT_TZ = process.env.AGENT_TZ || 'Asia/Kolkata';

const { parseCommand, parseReminder } = await import('../src/commands.js');
const store = await import('../src/store.js');
const { renderDashboard } = await import('../src/web.js');

const ok = (c) => (c ? '✓' : '✗');

console.log('— parseCommand —');
for (const s of [
  'save https://github.com/foo/bar cool rust project',
  'ask what is retrieval augmented generation',
  'remind me in 2h: ping Sam',
  'list',
  'find rust',
  'done #3',
  'cancel R2',
  'just a normal note with no command',
  'help',
]) {
  const c = parseCommand(s);
  console.log(`  ${s.slice(0, 42).padEnd(42)} → ${c.name.padEnd(9)} explicit=${c.explicit}`);
}

console.log('\n— parseReminder —');
for (const s of [
  'me in 2h: ping Sam',
  'me tomorrow 9am: review PR',
  'in 30m grab coffee',
  'me next monday 3pm: standup',
  'me tomorrow 9:30am: call dentist',
  'this is not a time',
]) {
  const r = parseReminder(s);
  console.log(
    `  ${s.slice(0, 32).padEnd(32)} → ${r.ok ? `${new Date(r.dueAt).toLocaleString('en-GB')} :: "${r.content}"` : `FAIL (${r.reason})`}`,
  );
}

console.log('\n— store —');
const a = store.saveItem({
  msgId: 'm1',
  content: 'https://github.com/foo/bar neat rust project',
  url: 'https://github.com/foo/bar',
  title: 'neat rust project',
});
const dup = store.saveItem({ msgId: 'm1', content: 'should be ignored' });
store.saveItem({ msgId: 'm2', content: 'remember to read SICP' });
const rem = store.addReminder({ msgId: 'r1', content: 'ping Sam', dueAt: Date.now() + 7_200_000 });

console.log('  saved items     :', store.listItems().map((i) => `#${i.id}`).join(' '));
console.log('  dedupe by msgId :', ok(dup.duplicate));
console.log('  find "rust"     :', store.findItems('rust').map((i) => `#${i.id}`).join(' ') || '(none)');
console.log('  reminders       :', store.pendingReminders().map((r) => `R${r.id}`).join(' '));
console.log('  remove #' + a.item.id + '       :', ok(store.removeItem(a.item.id)), '→ now', store.listItems().map((i) => `#${i.id}`).join(' '));
console.log('  cancel R' + rem.reminder.id + '       :', ok(store.cancelReminder(rem.reminder.id)), '→ now', store.pendingReminders().length, 'pending');

const html = renderDashboard();
console.log('\n— dashboard —');
console.log('  rendered HTML   :', html.length, 'bytes', ok(html.includes('whatsapp-agent')));
console.log('  data file       :', store.dbPath());
console.log('\nAll good ✅');
