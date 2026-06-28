import { complete } from './llm/index.js';

const SYSTEM = `You are a research assistant that turns things a user saved to their
WhatsApp into a tight, trustworthy briefing.

You will receive: the user's own note, the extracted content of any link(s) they
shared, and web-research results (each numbered as a source).

Write a briefing the user can read on their phone. Use WhatsApp formatting:
*bold* for headers, and "•" for bullets. Keep it concise and skimmable.

Structure exactly:
*TL;DR* — 1-2 sentences capturing the core idea.
*Key points* — 3-5 bullets of the most useful, concrete takeaways.
*Why it matters / context* — 1-3 bullets adding background the research surfaced.
*Sources* — numbered list of the research sources actually used, each as
  "n. Title — url".

Cite claims inline with [n] that map to the numbered sources. Only cite sources
you were given; never invent URLs. If the research is thin or missing, say so
honestly in one line instead of padding. Do not include a preamble or sign-off.`;

/**
 * @param {{ userNote?: string, articles?: any[], research?: any }} input
 * @returns {Promise<string>}
 */
export async function summarize({ userNote = '', articles = [], research = {} }) {
  const parts = [];

  if (userNote) parts.push(`USER NOTE:\n${userNote}`);

  if (articles.length) {
    parts.push('\nSHARED LINK CONTENT:');
    articles.forEach((a, i) => {
      if (a.ok) {
        const kind = a.kind ? `${a.kind}` : 'link';
        const caveat = a.note ? `  [${a.note}]` : '';
        parts.push(
          `\n[${kind} ${i + 1}] ${a.title || '(untitled)'} — ${a.source} (${a.url})${caveat}\n${a.text}`,
        );
      } else {
        parts.push(`\n[Link ${i + 1}] ${a.url} — could not extract (${a.reason}).`);
      }
    });
  }

  const results = research?.results || [];
  if (results.length) {
    parts.push('\nWEB RESEARCH SOURCES:');
    results.forEach((r, i) => {
      parts.push(`\n${i + 1}. ${r.title} — ${r.url}\n${r.content}`);
    });
  } else {
    parts.push('\nWEB RESEARCH SOURCES: (none available)');
  }

  if (research?.answer) parts.push(`\nRESEARCH SNAPSHOT:\n${research.answer}`);

  const user = parts.join('\n');
  return complete({ system: SYSTEM, user });
}
