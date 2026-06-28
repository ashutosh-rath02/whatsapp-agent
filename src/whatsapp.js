import pkg from 'whatsapp-web.js';
const { Client, LocalAuth } = pkg;
import qrcode from 'qrcode-terminal';
import QR from 'qrcode';
import path from 'node:path';

import { config } from './config.js';
import { log } from './logger.js';
import { shouldProcess, processMessage } from './pipeline.js';

export function createClient() {
  const client = new Client({
    authStrategy: new LocalAuth({ dataPath: '.wwebjs_auth' }),
    puppeteer: {
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
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
    if (cus) me.add(cus);
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
    log.info('Send a link or note to "Message Yourself" and the agent will reply.');
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
 * @c.us or @lid form). Returns { ok, reason } so skips are explainable.
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
  if (!shouldProcess(msg.body, config.agent.minTextLength))
    return { ok: false, reason: `too short (<${config.agent.minTextLength}) & no link` };
  return { ok: true, reason: 'trigger' };
}

async function handleMessage(client, msg) {
  const preview = msg.body.replace(/\s+/g, ' ').slice(0, 80);
  log.info(`▶ Processing: "${preview}"`);
  const chat = await msg.getChat(); // reply into the same chat (handles @lid)
  try {
    await safeReact(msg, '⏳');
    const { reply, meta } = await processMessage(msg.body);
    log.info('  ↳ done', meta);

    await chat.sendMessage(`${config.agent.replyMarker}\n\n${reply}`);
    await safeReact(msg, '✅');
  } catch (err) {
    log.error('Processing failed:', err?.message);
    await safeReact(msg, '❌');
    await chat
      .sendMessage(`${config.agent.replyMarker}\n\n⚠️ Couldn't process that: ${err?.message || 'unknown error'}`)
      .catch(() => {});
  }
}

async function safeReact(msg, emoji) {
  try {
    await msg.react(emoji);
  } catch {
    /* ignore */
  }
}
