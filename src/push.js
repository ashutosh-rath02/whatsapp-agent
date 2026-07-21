// Real phone push notifications via ntfy.sh (https://ntfy.sh) — free, no
// account, one HTTP POST per alert. Exists specifically because WhatsApp
// won't push a notification for anything sent by a linked device under your
// own account, in ANY chat (self-chat or a group) — that ruled out fixing
// this from inside WhatsApp at all. WhatsApp still gets the full message
// (history, links, "jobs"/"list" etc. all still work there); ntfy's job is
// only to make your phone buzz so you notice it arrived.
import { config } from './config.js';
import { log } from './logger.js';

/**
 * @param {string} title short, shows as the notification headline
 * @param {string} body  the notification body (ntfy truncates very long bodies)
 * @param {{ tags?: string[], priority?: number, click?: string }} [opts]
 */
export async function sendPush(title, body, opts = {}) {
  if (!config.push.topic) return;
  try {
    const headers = { Title: sanitizeHeader(title) };
    if (opts.tags?.length) headers.Tags = opts.tags.join(',');
    if (opts.priority) headers.Priority = String(opts.priority);
    if (opts.click) headers.Click = opts.click;

    const res = await fetch(`${config.push.server}/${config.push.topic}`, {
      method: 'POST',
      headers,
      body,
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) log.warn(`push: ntfy responded ${res.status}`);
  } catch (e) {
    // Never let a notification-channel hiccup break the actual delivery
    // (WhatsApp send / store write) it's riding alongside.
    log.warn('push: failed —', e?.message);
  }
}

// ntfy headers must be Latin-1 (HTTP header restriction) — emoji and other
// non-ASCII in a title throw. Strip to plain ASCII rather than lose the push.
function sanitizeHeader(s = '') {
  return String(s).replace(/[^\x20-\x7E]/g, '').trim().slice(0, 200) || 'whatsapp-agent';
}
