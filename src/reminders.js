// Polls the store for due reminders and delivers them into the self-chat.
// Because reminders are persisted on the /data volume, scheduled pings survive
// container restarts/redeploys — a reminder set yesterday still fires today.
import { config } from './config.js';
import { log } from './logger.js';
import { dueReminders, markReminderFired } from './store.js';

/**
 * @param {import('whatsapp-web.js').Client} client
 * @param {() => (string|null)} getSelfChatId  resolves the chat id to send to
 * @returns {() => void} stop function
 */
export function startReminderScheduler(client, getSelfChatId) {
  const pollMs = config.reminders.pollMs;
  let stopped = false;
  let timer = null;

  async function tick() {
    if (stopped) return;
    try {
      const due = dueReminders();
      if (due.length) {
        const chatId = getSelfChatId();
        if (!chatId) {
          log.warn(`${due.length} reminder(s) due but self-chat id unknown yet — will retry`);
        } else {
          for (const r of due) {
            const body = `${config.agent.replyMarker}\n\n⏰ *Reminder*\n${r.content || '_(no note)_'}`;
            try {
              await client.sendMessage(chatId, body);
              markReminderFired(r.id);
              log.info(`⏰ delivered reminder R${r.id}`);
            } catch (e) {
              log.warn(`couldn't deliver reminder R${r.id}: ${e?.message}`);
            }
          }
        }
      }
    } catch (e) {
      log.error('reminder tick failed:', e?.message);
    } finally {
      if (!stopped) timer = setTimeout(tick, pollMs);
    }
  }

  timer = setTimeout(tick, 3000); // brief delay so the client settles after ready
  log.info(`⏰ reminder scheduler on (every ${Math.round(pollMs / 1000)}s)`);
  return () => {
    stopped = true;
    if (timer) clearTimeout(timer);
  };
}
