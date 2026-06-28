import { config } from '../config.js';
import * as openai from './openai.js';
import * as gemini from './gemini.js';

const providers = { openai, gemini };

/**
 * Dispatch a single completion to the configured provider.
 * @param {{ system: string, user: string }} args
 * @returns {Promise<string>}
 */
export function complete(args) {
  const provider = providers[config.llm.provider];
  if (!provider) throw new Error(`Unknown LLM provider: ${config.llm.provider}`);
  return provider.complete(args);
}
