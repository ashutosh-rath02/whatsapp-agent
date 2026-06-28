// Exercises the explore → research → summarize pipeline WITHOUT WhatsApp/Chromium.
// Usage: node scripts/smoke.js "<text or url>"
import { assertRuntimeConfig, config } from '../src/config.js';
import { processMessage } from '../src/pipeline.js';

const input =
  process.argv.slice(2).join(' ') ||
  'https://en.wikipedia.org/wiki/Retrieval-augmented_generation';

const errs = assertRuntimeConfig();
if (errs.length) {
  console.error('Config errors:', errs);
  process.exit(1);
}

console.log(`Provider: ${config.llm.provider} (${config.llm[config.llm.provider].model})`);
console.log(`Tavily: ${config.research.tavilyApiKey ? 'on' : 'off'}`);
console.log(`\nINPUT: ${input}\n${'='.repeat(60)}`);

const t0 = Date.now();
const { reply, meta } = await processMessage(input);
console.log('\nMETA:', meta);
console.log(`\nREPLY (${Date.now() - t0}ms):\n${'='.repeat(60)}\n${reply}`);
