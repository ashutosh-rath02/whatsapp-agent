import OpenAI from 'openai';
import { config } from '../config.js';

let client;
function getClient() {
  if (!client) {
    client = new OpenAI({
      apiKey: config.llm.openai.apiKey,
      timeout: 60_000,
      maxRetries: 4,
    });
  }
  return client;
}

/**
 * @param {{ system: string, user: string }} param0
 * @returns {Promise<string>}
 */
export async function complete({ system, user }) {
  const res = await getClient().chat.completions.create({
    model: config.llm.openai.model,
    temperature: 0.3,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
  });
  return res.choices?.[0]?.message?.content?.trim() || '';
}
