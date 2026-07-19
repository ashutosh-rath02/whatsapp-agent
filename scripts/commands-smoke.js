// Exercises command parsing, reminder parsing, the JSON store, and the
// dashboard renderer WITHOUT WhatsApp/Chromium or any network/LLM calls.
//   node scripts/commands-smoke.js
import path from 'node:path';
import os from 'node:os';

// Point the store at a throwaway file BEFORE importing it (it reads env at load).
process.env.DB_PATH = path.join(os.tmpdir(), `wa-smoke-${Date.now()}.json`);
process.env.AGENT_TZ = process.env.AGENT_TZ || 'Asia/Kolkata';

const { parseReminder } = await import('../src/commands.js');
const store = await import('../src/store.js');
const { renderDashboard } = await import('../src/web.js');
const { loadPlugins } = await import('../src/plugins/index.js');

const ok = (c) => (c ? '✓' : '✗');
let failures = 0;
const expect = (cond, what) => {
  if (!cond) {
    failures++;
    console.log(`  ✗ FAILED: ${what}`);
  }
};

const registry = await loadPlugins();

console.log('— registry —');
console.log('  loaded          :', registry.names().join(', '));
expect(registry.size >= 8, 'all 8 plugins load');
for (const p of registry.list()) {
  expect(typeof p.run === 'function', `${p.name} has run()`);
  expect(Boolean(p.help), `${p.name} has help text`);
}
console.log('  contract        :', ok(failures === 0));

console.log('\n— routing —');
for (const [s, want] of [
  ['save https://github.com/foo/bar cool rust project', 'save'],
  ['ask what is retrieval augmented generation', 'research'],
  ['remind me in 2h: ping Sam', 'remind'],
  ['list', 'list'],
  ['find rust', 'find'],
  ['done #3', 'done'],
  ['cancel R2', 'cancel'],
  ['just a normal note with no command', 'research'],
  ['help', 'help'],
  ['STORE: something shouty', 'save'], // case + trailing punctuation
]) {
  const hit = registry.resolve(s);
  const got = hit.plugin?.name;
  expect(got === want, `"${s.slice(0, 30)}" → ${want} (got ${got})`);
  console.log(`  ${s.slice(0, 42).padEnd(42)} → ${String(got).padEnd(9)} explicit=${hit.explicit}`);
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

// Drive real plugins through a fake ctx — no WhatsApp, no network.
console.log('\n— plugin execution —');
async function runPlugin(body) {
  const hit = registry.resolve(body);
  const sent = [];
  const reacted = [];
  await hit.plugin.run({
    arg: hit.arg,
    raw: body,
    explicit: hit.explicit,
    msg: { id: { _serialized: `smoke-${Math.random()}` } },
    chat: { id: { _serialized: 'smoke@lid' } },
    registry,
    say: (b) => sent.push(b),
    react: (e) => reacted.push(e),
  });
  return { sent: sent.join('\n'), reacted };
}

const saved = await runPlugin('save https://example.com/x a smoke-test note');
expect(saved.sent.includes('Saved'), 'save replies with confirmation');
expect(saved.reacted.includes('📌'), 'save reacts 📌');
console.log('  save            :', ok(saved.sent.includes('Saved')), saved.sent.split('\n')[0]);

const listed = await runPlugin('list');
expect(listed.sent.includes('smoke-test note'), 'list shows the saved item');
console.log('  list            :', ok(listed.sent.includes('smoke-test note')));

const helped = await runPlugin('help');
expect(helped.sent.includes('`save'), 'help is generated from plugin descriptors');
expect(helped.sent.includes('`find'), 'help includes every plugin');
console.log('  help (generated):', ok(helped.sent.includes('`find')), `${helped.sent.split('\n').length} lines`);

const bad = await runPlugin('done'); // missing id — must not throw
expect(bad.sent.includes('done <#id>'), 'done without an id explains itself');
console.log('  done (no arg)   :', ok(bad.sent.includes('done <#id>')));

const html = renderDashboard();
console.log('\n— dashboard —');
console.log('  rendered HTML   :', html.length, 'bytes', ok(html.includes('whatsapp-agent')));
console.log('  data file       :', store.dbPath());

console.log(failures === 0 ? '\nAll good ✅' : `\n${failures} check(s) FAILED ❌`);
process.exit(failures === 0 ? 0 : 1);
