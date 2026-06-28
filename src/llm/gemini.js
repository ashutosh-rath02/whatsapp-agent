import { GoogleGenerativeAI } from '@google/generative-ai';
import { config } from '../config.js';

let model;
function getModel() {
  if (!model) {
    const genAI = new GoogleGenerativeAI(config.llm.gemini.apiKey);
    model = genAI.getGenerativeModel({ model: config.llm.gemini.model });
  }
  return model;
}

/**
 * @param {{ system: string, user: string }} param0
 * @returns {Promise<string>}
 */
export async function complete({ system, user }) {
  const res = await getModel().generateContent({
    systemInstruction: { role: 'system', parts: [{ text: system }] },
    contents: [{ role: 'user', parts: [{ text: user }] }],
    generationConfig: { temperature: 0.3 },
  });
  return res.response.text().trim();
}
