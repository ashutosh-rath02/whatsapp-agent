import { config, assertRuntimeConfig } from './config.js';
import { log } from './logger.js';
import { createClient } from './whatsapp.js';

function banner() {
  log.info('whatsapp-agent — Phase 1 (links + text)');
  log.info(`LLM provider: ${config.llm.provider} (${config.llm[config.llm.provider]?.model})`);
  log.info(`Research: ${config.research.tavilyApiKey ? 'Tavily' : 'disabled (no TAVILY_API_KEY)'}`);
}

async function main() {
  banner();

  const errors = assertRuntimeConfig();
  if (errors.length) {
    errors.forEach((e) => log.error(e));
    log.error('Fix .env and restart.');
    process.exit(1);
  }

  const client = createClient();

  const shutdown = async (sig) => {
    log.info(`\n${sig} received, shutting down…`);
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
