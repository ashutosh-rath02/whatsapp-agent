import { config, assertRuntimeConfig } from './config.js';
import { log } from './logger.js';
import { createClient } from './whatsapp.js';
import { startWebServer } from './web.js';
import { dbPath } from './store.js';
import { loadPlugins } from './plugins/index.js';

function banner() {
  log.info('whatsapp-agent — commands + research');
  log.info(`LLM provider: ${config.llm.provider} (${config.llm[config.llm.provider]?.model})`);
  log.info(`Research: ${config.research.tavilyApiKey ? 'Tavily' : 'disabled (no TAVILY_API_KEY)'}`);
  log.info(`Storage: ${dbPath()}`);
  log.info(`Commands: ${config.agent.commandsEnabled ? 'on (save / ask / remind / list)' : 'off'}`);
  log.info(`News: ${config.news.enabled ? `daily digest at ${config.news.digestTime} (${config.agent.timezone || 'host tz'})` : 'off'}`);
}

async function main() {
  banner();

  const errors = assertRuntimeConfig();
  if (errors.length) {
    errors.forEach((e) => log.error(e));
    log.error('Fix .env and restart.');
    process.exit(1);
  }

  const registry = await loadPlugins();
  log.info(`Plugins: ${registry.size} loaded (${registry.names().join(', ')})`);

  const client = createClient(registry);
  const web = config.web.enabled ? startWebServer() : null;

  const shutdown = async (sig) => {
    log.info(`\n${sig} received, shutting down…`);
    try {
      if (web) await web.stop();
    } catch {
      /* ignore */
    }
    try {
      await client.destroy();
    } catch {
      /* ignore */
    }
    process.exit(0);
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  log.info('Initializing WhatsApp client (first run downloads/launches Chromium)…');
  await client.initialize();
}

main().catch((err) => {
  log.error('Fatal:', err);
  process.exit(1);
});
