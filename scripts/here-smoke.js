// Offline test of the `here` command (redirect reminders/jobs/news to a
// WhatsApp group instead of self-chat, since self-chat messages sent from
// a linked device don't push a phone notification). No network, no real
// WhatsApp client — constructs fake msg/client/me objects.
//   node scripts/here-smoke.js
import path from 'node:path';
import os from 'node:os';

process.env.DB_PATH = path.join(os.tmpdir(), `wa-here-smoke-${Date.now()}.json`);

const { handleHereCommand } = await import('../src/whatsapp.js');
const store = await import('../src/store.js');

let failures = 0;
const expect = (cond, what) => {
  console.log(`  ${cond ? '✓' : '✗ FAILED:'} ${what}`);
  if (!cond) failures++;
};

const ME_CUS = '918018663432@c.us';
const ME_LID = '111991289077994@lid';
const me = new Set([ME_CUS, ME_LID]);
const clientSent = [];
const fakeClient = { sendMessage: async (to, body) => { clientSent.push({ to, body }); } };

function fakeMsg({ to, getChat }) {
  return { to, getChat };
}

console.log('— self-chat "here" (no group registered yet) —');
expect(store.getMeta('notify_group_id') === null, 'starts unregistered');
{
  const sent = [];
  const msg = fakeMsg({ to: ME_CUS }); // no getChat -> resolveChat falls back using msg.from/selfChatId
  msg.from = ME_CUS;
  await handleHereCommand(fakeClient, { ...msg, getChat: async () => { throw new Error('n/a'); } }, me);
  expect(store.getMeta('notify_group_id') === null, 'self-chat "here" leaves target unregistered (already was)');
}

console.log('\n— group "here": solo group (just me) —');
{
  const sent = [];
  const chat = {
    id: { _serialized: 'solo-group@g.us' },
    participants: [{ id: { _serialized: ME_CUS } }, { id: { _serialized: ME_LID } }],
    sendMessage: async (body) => sent.push(body),
  };
  const msg = fakeMsg({ to: 'solo-group@g.us', getChat: async () => chat });
  await handleHereCommand(fakeClient, msg, me);
  expect(store.getMeta('notify_group_id') === 'solo-group@g.us', 'solo group registered as notify target');
  expect(sent.length === 1 && sent[0].includes('will come here'), 'confirmation sent into the group');
}

console.log('\n— group "here": group with someone else in it —');
{
  const before = store.getMeta('notify_group_id');
  const sent = [];
  const chat = {
    id: { _serialized: 'risky-group@g.us' },
    participants: [
      { id: { _serialized: ME_CUS } },
      { id: { _serialized: ME_LID } },
      { id: { _serialized: '999888777@c.us' } }, // someone else
    ],
    sendMessage: async (body) => sent.push(body),
  };
  const msg = fakeMsg({ to: 'risky-group@g.us', getChat: async () => chat });
  await handleHereCommand(fakeClient, msg, me);
  expect(store.getMeta('notify_group_id') === before, 'registration refused — target unchanged (still the solo group)');
  expect(sent.length === 1 && sent[0].includes("won't switch"), 'warned instead of silently registering');
  expect(sent[0].includes('1 other member'), 'warning states the correct other-member count');
}

console.log('\n— group "here": getChat() keeps failing (retries, then always notifies) —');
{
  const before = store.getMeta('notify_group_id');
  clientSent.length = 0;
  let calls = 0;
  const msg = fakeMsg({
    to: 'broken-group@g.us',
    getChat: async () => { calls++; throw new Error('boom'); },
  });
  const t0 = Date.now();
  await handleHereCommand(fakeClient, msg, me); // must not throw
  expect(calls === 4, `retried getChat() 4 times before giving up (got ${calls})`);
  expect(Date.now() - t0 >= 400, 'backed off between retries rather than hammering immediately');
  expect(store.getMeta('notify_group_id') === before, 'failure to load the chat leaves target unchanged (fail closed)');
  expect(
    clientSent.length === 1 && clientSent[0].to === 'broken-group@g.us' && clientSent[0].body.includes("Couldn't check this group"),
    'user is told it failed — never silent, unlike before this fix',
  );
}

console.log('\n— group "here": getChat() fails once, then succeeds (retry recovers) —');
{
  clientSent.length = 0;
  let calls = 0;
  const chat = {
    id: { _serialized: 'flaky-group@g.us' },
    participants: [{ id: { _serialized: ME_CUS } }],
    sendMessage: async (body) => {},
  };
  const msg = fakeMsg({
    to: 'flaky-group@g.us',
    getChat: async () => {
      calls++;
      if (calls < 2) throw new Error('transient');
      return chat;
    },
  });
  await handleHereCommand(fakeClient, msg, me);
  expect(store.getMeta('notify_group_id') === 'flaky-group@g.us', 'a transient failure that later succeeds still registers correctly');
}

console.log('\n— self-chat "here" again: reverts to self-chat —');
{
  const msg = { to: ME_LID, from: ME_LID, getChat: async () => { throw new Error('n/a'); } };
  await handleHereCommand(fakeClient, msg, me);
  expect(store.getMeta('notify_group_id') === null, 'sending "here" in self-chat clears the group override');
}

console.log(failures === 0 ? '\nAll good ✅' : `\n${failures} check(s) FAILED ❌`);
process.exit(failures === 0 ? 0 : 1);
