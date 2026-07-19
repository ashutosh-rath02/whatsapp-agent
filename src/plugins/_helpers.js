// Shared helpers for plugins. Underscore-prefixed so the loader never treats
// this as a plugin.
import { findUrls, hostOf } from '../extract.js';
import { trunc } from '../format.js';
import * as store from '../store.js';

/** A short human label for a saved item: first line, else host, else the text. */
export function makeTitle(content, url) {
  const firstLine = content.split('\n')[0].trim();
  const firstUrl = findUrls(firstLine)[0];
  const stripped = (firstUrl ? firstLine.replace(firstUrl, '') : firstLine).replace(/\s+/g, ' ').trim();
  if (stripped) return trunc(stripped, 70);
  if (url) return hostOf(url);
  return trunc(content, 70) || 'note';
}

/** Cancel a reminder by numeric id and report the outcome. Shared by done/cancel. */
export async function cancelReminderById(ctx, id) {
  const ok = store.cancelReminder(id);
  await ctx.say(ok ? `🗑️ Cancelled reminder R${id}.` : `🤷 No pending reminder R${id}.`);
}
