import pkg from 'whatsapp-web.js';
const { Client, LocalAuth } = pkg;
import qrcode from 'qrcode-terminal';
import QR from 'qrcode';
import fs from 'node:fs';
import path from 'node:path';

import { config } from './config.js';
import { log } from './logger.js';
import { shouldProcess, processMessage } from './pipeline.js';
import { parseCommand, parseReminder } from './commands.js';
import { findUrls, hostOf } from './extract.js';
import * as store from './store.js';
import { startReminderScheduler } from './reminders.js';
import { relTime, fmtAbsolute, trunc } from './format.js';

const AUTH_PATH = process.env.WWEBJS_AUTH_PATH || '.wwebjs_auth';

// The chat id to send unsolicited messages (reminders) to. Persisted so it
// survives restarts; captured from real self-chat messages, with the @c.us id
// as a startup fallback.
let selfChatId = store.getMeta('self_chat_id');
function rememberSelfChat(id) {
  if (id && id !== selfChatId) {
    selfChatId = id;
    store.setMeta('self_chat_id', id);
  }
}

/**
 * Remove a stale Chromium singleton lock left behind by a hard crash / kill.
 * Safe because this app runs single-instance; without it, a restart fails with
 * "browser is already running for <userDataDir>".
 */
function clearStaleLock() {
  const sessionDir = path.join(AUTH_PATH, 'session');
  try {
    for (const f of fs.readdirSync(sessionDir)) {
      if (f.startsWith('Singleton')) fs.rmSync(path.join(sessionDir, f), { force: true });
    }
  } catch {
    /* dir may not exist yet — fine */
  }
}

export function createClient() {
  clearStaleLock();
  const client = new Client({
    authStrategy: new LocalAuth({ dataPath: AUTH_PATH }),
    puppeteer: {
      headless: true,
      // PUPPETEER_EXECUTABLE_PATH lets the container use system Chromium.
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage', // avoid /dev/shm exhaustion in containers
        '--disable-gpu',
      ],
    },
  });

  // "me" can be addressed two ways: phone-number id (@c.us) and the newer
  // LinkedID (@lid). The self-chat uses the @lid form, so we track both.
  const me = new Set();
  // Process one message at a time so we don't hammer the APIs or get rate-limited.
  let chain = Promise.resolve();

  client.on('qr', async (qr) => {
    log.info('Scan with WhatsApp → Settings → Linked devices → Link a device:');
    qrcode.generate(qr, { small: true }); // ASCII fallback for terminal users
    try {
      const out = path.resolve('whatsapp-qr.png');
      await QR.toFile(out, qr, { width: 512, margin: 2 });
      log.info(`QR image saved → ${out}  (open it and scan)`);
    } catch (e) {
      log.warn('Could not save QR PNG:', e?.message);
    }
  });

  client.on('authenticated', () => log.info('Authenticated ✔'));
  client.on('auth_failure', (m) => log.error('Auth failure:', m));
  client.on('disconnected', (r) => log.warn('Disconnected:', r));

  client.on('ready', async () => {
    const cus = client.info?.wid?._serialized || null;
    if (cus) {
      me.add(cus);
      if (!selfChatId) rememberSelfChat(cus); // fallback target until a real msg arrives
    }
    // Resolve our LinkedID (@lid) — the id the self-chat is addressed with.
    let lid = null;
    try {
      lid = await client.pupPage.evaluate(() => {
        const w = window.require('WAWebUserPrefsMeUser').getMaybeMeLidUser?.();
        return w ? w._serialized || `${w.user}@${w.server}` : null;
      });
      if (lid) me.add(lid);
    } catch (e) {
      log.warn('Could not resolve @lid:', e?.message);
    }
    log.info(`Ready ✅  Listening to your self-chat (pn=${cus} lid=${lid || 'n/a'}).`);
    log.info('Send a link/note, or a command (save / ask / remind / list / help).');

    if (config.reminders.enabled) startReminderScheduler(client, () => selfChatId);
  });

  client.on('message_create', (msg) => {
    const decision = selfChatDecision(msg, me);
    if (msg.fromMe) {
      log.debug('↧ fromMe', { from: msg.from, to: msg.to, type: msg.type, decision: decision.reason });
    }
    if (!decision.ok) return;
    // Queue sequentially; never let one failure break the chain.
    chain = chain.then(() => handleMessage(client, msg)).catch((e) => log.error(e));
  });

  return client;
}

/**
 * Decide whether a message is fresh text in the user's own "Message Yourself"
 * chat. A self-chat message has BOTH endpoints resolving to us (in either
 * @c.us or @lid form). Explicit commands always pass; otherwise we apply the
 * research gate (links, or text of some substance). Returns { ok, reason }.
 */
function selfChatDecision(msg, me) {
  if (me.size === 0) return { ok: false, reason: 'client not ready' };
  if (!msg.fromMe) return { ok: false, reason: 'not from me' };
  const isSelf = me.has(msg.from) && me.has(msg.to);
  if (!isSelf) return { ok: false, reason: `other chat (to=${msg.to})` };
  if (msg.type !== 'chat') return { ok: false, reason: `non-text type=${msg.type}` };
  if (!msg.body) return { ok: false, reason: 'empty body' };
  if (msg.body.startsWith(config.agent.replyMarker))
    return { ok: false, reason: 'own agent reply' };
  if (config.agent.commandsEnabled) {
    const cmd = parseCommand(msg.body);
    if (cmd.explicit) return { ok: true, reason: `cmd:${cmd.name}` };
  }
  if (!shouldProcess(msg.body, config.agent.minTextLength))
    return { ok: false, reason: `too short (<${config.agent.minTextLength}) & no link` };
  return { ok: true, reason: 'research' };
}

/**
 * Resolve the chat to reply into. `msg.getChat()` reaches into WhatsApp Web's
 * internals and intermittently throws a minified error ("r: r") for @lid
 * self-chats. The handlers only ever need `id._serialized` and `sendMessage`,
 * so fall back to sending by id rather than dropping the message.
 */
async function resolveChat(client, msg) {
  try {
    const chat = await msg.getChat(); // reply into the same chat (handles @lid)
    if (chat) return chat;
  } catch (err) {
    log.warn(`getChat() failed (${err?.message || 'unknown'}) — replying by id`);
  }
  const id = msg.from || selfChatId;
  if (!id) return null;
  return { id: { _serialized: id }, sendMessage: (body) => client.sendMessage(id, body) };
}

async function handleMessage(client, msg) {
  const preview = msg.body.replace(/\s+/g, ' ').slice(0, 80);
  const chat = await resolveChat(client, msg);
  if (!chat) {
    log.error(`No chat to reply into — dropped "${preview}"`);
    return;
  }
  rememberSelfChat(chat?.id?._serialized);

  const cmd = config.agent.commandsEnabled
    ? parseCommand(msg.body)
    : { name: 'research', arg: msg.body, explicit: false };
  log.info(`▶ [${cmd.explicit ? cmd.name : 'research'}] "${preview}"`);

  try {
    switch (cmd.name) {
      case 'save':
        return await cmdSave(chat, msg, cmd.arg);
      case 'remind':
        return await cmdRemind(chat, msg, cmd.arg);
      case 'list':
        return await cmdList(chat);
      case 'find':
        return await cmdFind(chat, cmd.arg);
      case 'done':
        return await cmdDone(chat, cmd.arg);
      case 'cancel':
        return await cmdCancel(chat, cmd.arg);
      case 'help':
        return await cmdHelp(chat);
      default:
        return await cmdResearch(chat, msg, cmd);
    }
  } catch (err) {
    log.error('Handler failed:', err?.message);
    await safeReact(msg, '❌');
    await say(chat, `⚠️ Couldn't do that: ${err?.message || 'unknown error'}`).catch(() => {});
  }
}

// ── Command handlers ─────────────────────────────────────────────────────────

async function cmdResearch(chat, msg, cmd) {
  const input = cmd.explicit ? cmd.arg : msg.body;
  if (cmd.explicit && !input.trim()) {
    await say(chat, '🔎 Send `ask <link or question>`.');
    return;
  }
  await safeReact(msg, '⏳');
  const { reply, meta } = await processMessage(input);
  log.info('  ↳ done', meta);
  await say(chat, reply);
  await safeReact(msg, '✅');
}

async function cmdSave(chat, msg, arg) {
  const content = (arg || '').trim();
  if (!content) {
    await say(chat, '📌 Nothing to save — try `save <link or note>`.');
    return;
  }
  const url = findUrls(content)[0] || null;
  const title = makeTitle(content, url);
  const { item, duplicate } = store.saveItem({ msgId: msg.id?._serialized, content, url, title });
  await safeReact(msg, '📌');
  await say(
    chat,
    `📌 *Saved* #${item.id}${duplicate ? ' _(already had it)_' : ''}\n${title}` +
      `\n\n_View everything on the dashboard, or \`list\` here._`,
  );
}

async function cmdRemind(chat, msg, arg) {
  const parsed = parseReminder(arg);
  if (!parsed.ok) {
    await safeReact(msg, '❓');
    await say(
      chat,
      `⏰ ${parsed.reason}\nTry: \`remind me in 2h: ping Sam\` or \`remind me tomorrow 9am: review PR\`.`,
    );
    return;
  }
  if (parsed.dueAt <= Date.now() + 1000) {
    await say(chat, '⏰ That time looks like it’s already past — give me a future time.');
    return;
  }
  const { reminder, duplicate } = store.addReminder({
    msgId: msg.id?._serialized,
    content: parsed.content,
    dueAt: parsed.dueAt,
  });
  await safeReact(msg, '⏰');
  const when = `${relTime(parsed.dueAt)} (${fmtAbsolute(parsed.dueAt, config.agent.timezone)})`;
  await say(
    chat,
    `⏰ *Reminder set* R${reminder.id}${duplicate ? ' _(already set)_' : ''}\n${when}\n${parsed.content || '_(no note)_'}`,
  );
}

async function cmdList(chat) {
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
  await say(chat, lines.join('\n'));
}

async function cmdFind(chat, arg) {
  const q = (arg || '').trim();
  if (!q) {
    await say(chat, '🔍 `find <text>` — what should I look for?');
    return;
  }
  const hits = store.findItems(q, 10);
  if (!hits.length) {
    await say(chat, `🔍 No saved items match “${q}”.`);
    return;
  }
  const lines = [`🔍 *Matches for “${q}”*`];
  for (const i of hits) lines.push(`#${i.id} · ${trunc(i.title || i.content, 50)}${i.url ? `\n   ${i.url}` : ''}`);
  await say(chat, lines.join('\n'));
}

async function cmdDone(chat, arg) {
  const raw = (arg || '').trim();
  const rMatch = raw.match(/^r\s*#?(\d+)/i); // "done R2" → cancel reminder
  if (rMatch) return cancelById(chat, Number(rMatch[1]));
  const id = Number((raw.match(/\d+/) || [])[0]);
  if (!id) {
    await say(chat, 'Use `done <#id>` — see `list`.');
    return;
  }
  const ok = store.removeItem(id);
  await say(chat, ok ? `✅ Cleared #${id}.` : `🤷 No open item #${id}.`);
}

async function cmdCancel(chat, arg) {
  const id = Number((String(arg || '').match(/\d+/) || [])[0]);
  if (!id) {
    await say(chat, 'Use `cancel <Rid>` — see `list`.');
    return;
  }
  return cancelById(chat, id);
}

async function cancelById(chat, id) {
  const ok = store.cancelReminder(id);
  await say(chat, ok ? `🗑️ Cancelled reminder R${id}.` : `🤷 No pending reminder R${id}.`);
}

async function cmdHelp(chat) {
  await say(
    chat,
    [
      '🤖 *Agent commands* — send these to this chat:',
      '',
      '🔎 _(default)_ paste a link/note → I research & reply with sources.',
      '📌 `save <link/note>` — just store it, no research.',
      '⏰ `remind me <when>: <note>` — e.g. `in 2h: …`, `tomorrow 9am: …`.',
      '🗂️ `list` — show saved items + reminders.',
      '🔍 `find <text>` — search saved items.',
      '✅ `done <#id>` — clear a saved item.',
      '🗑️ `cancel <Rid>` — drop a reminder.',
      '❓ `help` — this message.',
    ].join('\n'),
  );
}

// ── helpers ──────────────────────────────────────────────────────────────────

function makeTitle(content, url) {
  const firstLine = content.split('\n')[0].trim();
  const firstUrl = findUrls(firstLine)[0];
  const stripped = (firstUrl ? firstLine.replace(firstUrl, '') : firstLine).replace(/\s+/g, ' ').trim();
  if (stripped) return trunc(stripped, 70);
  if (url) return hostOf(url);
  return trunc(content, 70) || 'note';
}

async function say(chat, body) {
  return chat.sendMessage(`${config.agent.replyMarker}\n\n${body}`);
}

async function safeReact(msg, emoji) {
  try {
    await msg.react(emoji);
  } catch {
    /* ignore */
  }
}
