// Offline test of the ntfy.sh push module: disabled-by-default no-op,
// header sanitization (emoji/non-ASCII would throw as a raw HTTP header —
// verified against Node's real fetch during development), and that a
// failure never throws (a notification-channel hiccup must never break the
// WhatsApp delivery it rides alongside). No real network call is made.
//   node scripts/push-smoke.js
const originalFetch = global.fetch;
let calls = [];
global.fetch = async (url, opts) => {
  calls.push({ url, opts });
  return { ok: true, status: 200 };
};

const { sendPush } = await import('../src/push.js');
const { config } = await import('../src/config.js');

let failures = 0;
const expect = (cond, what) => {
  console.log(`  ${cond ? '✓' : '✗ FAILED:'} ${what}`);
  if (!cond) failures++;
};

console.log('— disabled (no NTFY_TOPIC) —');
config.push.topic = '';
await sendPush('Test', 'body');
expect(calls.length === 0, 'no fetch call when topic is unset (default off)');

console.log('\n— enabled: basic send —');
config.push.topic = 'test-topic';
config.push.server = 'https://ntfy.sh';
calls = [];
await sendPush('Reminder', 'call mom', { tags: ['alarm_clock'] });
expect(calls.length === 1, 'one fetch call when enabled');
expect(calls[0].url === 'https://ntfy.sh/test-topic', 'posts to server/topic');
expect(calls[0].opts.method === 'POST', 'uses POST');
expect(calls[0].opts.body === 'call mom', 'body is the raw message text');
expect(calls[0].opts.headers.Title === 'Reminder', 'title header set');
expect(calls[0].opts.headers.Tags === 'alarm_clock', 'tags header set from opts.tags');

console.log('\n— header sanitization (emoji/non-ASCII would throw as a raw HTTP header) —');
calls = [];
await sendPush('⏰ Reminder', 'body');
expect(calls.length === 1, 'still sends despite an emoji title');
expect(calls[0].opts.headers.Title === 'Reminder', 'emoji stripped from the title header, ASCII text kept');
expect(!/[^\x20-\x7E]/.test(calls[0].opts.headers.Title), 'sanitized title is pure ASCII (would not throw as a real header)');

console.log('\n— never throws, even if fetch fails —');
global.fetch = async () => { throw new Error('network down'); };
let threw = false;
try {
  await sendPush('Title', 'body');
} catch {
  threw = true;
}
expect(!threw, 'a failed push never propagates — must not break the WhatsApp send it rides alongside');

global.fetch = async () => ({ ok: false, status: 500 });
threw = false;
try {
  await sendPush('Title', 'body');
} catch {
  threw = true;
}
expect(!threw, 'a non-2xx response also does not throw');

global.fetch = originalFetch;
console.log(failures === 0 ? '\nAll good ✅' : `\n${failures} check(s) FAILED ❌`);
process.exit(failures === 0 ? 0 : 1);
