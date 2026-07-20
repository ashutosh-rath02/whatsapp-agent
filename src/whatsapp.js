import pkg from 'whatsapp-web.js';
const { Client, LocalAuth } = pkg;
import qrcode from 'qrcode-terminal';
import QR from 'qrcode';
import fs from 'node:fs';
import path from 'node:path';

import { config } from './config.js';
import { log } from './logger.js';
import { shouldProcess } from './pipeline.js';
import * as store from './store.js';
import { startReminderScheduler } from './reminders.js';
import { startNewsScheduler } from './news.js';
import { startJobsScheduler } from './jobs.js';

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

export function createClient(registry) {
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
  // Sync progress between 'authenticated' and 'ready' — without this a slow or
  // stalled sync looks identical to a hang.
  client.on('loading_screen', (pct, message) => log.info(`Syncing… ${pct}% ${message || ''}`));
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
    if (config.news.enabled) startNewsScheduler(client, () => selfChatId);
    if (config.jobs.enabled) startJobsScheduler(client, () => selfChatId);
  });

  client.on('message_create', (msg) => {
    const decision = selfChatDecision(msg, me, registry);
    if (msg.fromMe) {
      log.debug('↧ fromMe', { from: msg.from, to: msg.to, type: msg.type, decision: decision.reason });
    }
    if (!decision.ok) return;
    // Queue sequentially; never let one failure break the chain.
    chain = chain.then(() => handleMessage(client, msg, registry)).catch((e) => log.error(e));
  });

  return client;
}

/**
 * Decide whether a message is fresh text in the user's own "Message Yourself"
 * chat. A self-chat message has BOTH endpoints resolving to us (in either
 * @c.us or @lid form). Explicit commands always pass; otherwise we apply the
 * research gate (links, or text of some substance). Returns { ok, reason }.
 */
function selfChatDecision(msg, me, registry) {
  if (me.size === 0) return { ok: false, reason: 'client not ready' };
  if (!msg.fromMe) return { ok: false, reason: 'not from me' };
  const isSelf = me.has(msg.from) && me.has(msg.to);
  if (!isSelf) return { ok: false, reason: `other chat (to=${msg.to})` };
  if (msg.type !== 'chat') return { ok: false, reason: `non-text type=${msg.type}` };
  if (!msg.body) return { ok: false, reason: 'empty body' };
  if (msg.body.startsWith(config.agent.replyMarker))
    return { ok: false, reason: 'own agent reply' };
  if (config.agent.commandsEnabled) {
    const hit = registry.resolve(msg.body);
    if (hit.explicit) return { ok: true, reason: `cmd:${hit.plugin.name}` };
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

async function handleMessage(client, msg, registry) {
  const preview = msg.body.replace(/\s+/g, ' ').slice(0, 80);
  const chat = await resolveChat(client, msg);
  if (!chat) {
    log.error(`No chat to reply into — dropped "${preview}"`);
    return;
  }
  rememberSelfChat(chat?.id?._serialized);

  const hit = config.agent.commandsEnabled
    ? registry.resolve(msg.body)
    : { ...registry.resolve(''), arg: msg.body, explicit: false };
  if (!hit.plugin) {
    log.warn(`No plugin for "${preview}" — ignored`);
    return;
  }
  log.info(`▶ [${hit.plugin.name}] "${preview}"`);

  // Everything a plugin is allowed to touch. Plugins never see the raw
  // whatsapp-web.js client, which keeps them testable offline.
  const ctx = {
    arg: hit.arg,
    raw: msg.body,
    explicit: hit.explicit,
    msg,
    chat,
    registry,
    say: (body) => say(chat, body),
    react: (emoji) => safeReact(msg, emoji),
  };

  // Error boundary per plugin: a broken feature reports back instead of
  // taking the handler down with it.
  try {
    await hit.plugin.run(ctx);
  } catch (err) {
    log.error(`plugin ${hit.plugin.name} failed:`, err?.message);
    await safeReact(msg, '❌');
    await say(chat, `⚠️ Couldn't do that: ${err?.message || 'unknown error'}`).catch(() => {});
  }
}

// ── helpers ──────────────────────────────────────────────────────────────────

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
