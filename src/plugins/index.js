import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { config } from '../config.js';
import { log } from '../logger.js';
import { splitCommand } from '../commands.js';

const DIR = path.dirname(fileURLToPath(import.meta.url));

/**
 * Plugin descriptor (default export of each file in this directory):
 *
 *   {
 *     name:     'save',                       // unique id, used by PLUGINS_DISABLED
 *     keywords: ['save', 'store', 'keep'],    // first word of a message routes here
 *     help:     'save <link/note> — …',       // one line; `help` is generated from these
 *     order:    20,                           // sort order in the help listing
 *     fallback: false,                        // exactly one plugin claims unmatched text
 *     enabled:  (config) => true,             // optional runtime gate
 *     async run(ctx) {}                       // ctx = { arg, raw, msg, chat, say, react, … }
 *   }
 *
 * Files starting with "_" are helpers, not plugins, and are never loaded.
 */

function disabledSet() {
  return new Set(
    (process.env.PLUGINS_DISABLED || '')
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
  );
}

export async function loadPlugins() {
  const files = fs
    .readdirSync(DIR)
    .filter((f) => f.endsWith('.js') && f !== 'index.js' && !f.startsWith('_'))
    .sort();

  const disabled = disabledSet();
  const plugins = [];
  const byKeyword = new Map();
  let fallback = null;

  for (const file of files) {
    let plugin;
    try {
      plugin = (await import(`./${file}`)).default;
    } catch (err) {
      log.error(`plugin ${file} failed to load:`, err?.message);
      continue;
    }
    if (!plugin?.name || typeof plugin.run !== 'function') {
      log.warn(`plugin ${file} skipped — needs { name, run }`);
      continue;
    }
    if (disabled.has(plugin.name.toLowerCase())) {
      log.info(`plugin ${plugin.name} disabled via PLUGINS_DISABLED`);
      continue;
    }
    if (typeof plugin.enabled === 'function' && !plugin.enabled(config)) {
      log.debug(`plugin ${plugin.name} disabled by config`);
      continue;
    }

    for (const kw of plugin.keywords || []) {
      const key = kw.toLowerCase();
      const owner = byKeyword.get(key);
      if (owner) {
        log.warn(`plugin ${plugin.name}: keyword "${key}" already claimed by ${owner.name} — ignored`);
        continue;
      }
      byKeyword.set(key, plugin);
    }
    if (plugin.fallback) {
      if (fallback) log.warn(`plugin ${plugin.name}: fallback already claimed by ${fallback.name} — ignored`);
      else fallback = plugin;
    }
    plugins.push(plugin);
  }

  if (!fallback) log.warn('no fallback plugin — messages without a keyword will be ignored');

  return {
    /** Route a raw message body to a plugin. */
    resolve(body = '') {
      const { key, rest, text } = splitCommand(body);
      const hit = byKeyword.get(key);
      if (hit) return { plugin: hit, arg: rest, explicit: true, keyword: key };
      return { plugin: fallback, arg: text, explicit: false, keyword: null };
    },
    /** Loaded plugins, in help order. */
    list() {
      return [...plugins].sort((a, b) => (a.order ?? 100) - (b.order ?? 100));
    },
    get size() {
      return plugins.length;
    },
    names() {
      return plugins.map((p) => p.name);
    },
  };
}
