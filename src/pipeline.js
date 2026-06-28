import { findUrls, textWithoutUrls, extractUrl } from './extract.js';
import { research } from './research.js';
import { summarize } from './summarize.js';
import { transcribeUrl } from './transcribe.js';
import { config } from './config.js';
import { log } from './logger.js';

/**
 * Decide whether a self-chat message is worth acting on.
 */
export function shouldProcess(text, minTextLength) {
  if (!text) return false;
  if (findUrls(text).length > 0) return true; // any link → process
  return text.trim().length >= minTextLength; // otherwise needs some substance
}

/**
 * Run the full explore → research → summarize pipeline on a message.
 * @returns {Promise<{ reply: string, meta: object }>}
 */
export async function processMessage(text) {
  const urls = findUrls(text);
  const userNote = textWithoutUrls(text);

  // 1. Explore: extract readable content for each shared link.
  const articles = [];
  for (const url of urls) {
    log.info('  ↳ extracting', url);
    articles.push(await extractUrl(url));
  }

  // 1b. Transcribe any video (reel / tweet) so spoken-only content is captured.
  if (config.transcription.enabled) {
    for (const a of articles) {
      if (!a.ok || !a.videoUrl) continue;
      log.info('  ↳ transcribing video audio…');
      const tr = await transcribeUrl(a.videoUrl);
      if (tr.ok) {
        a.text = `${a.text}\n\n[Spoken transcript]\n${tr.text}`.slice(0, 14000);
        a.transcribed = true;
      } else {
        a.transcribeError = tr.reason;
        a.note = a.note ? `${a.note}; transcript unavailable (${tr.reason})` : `transcript unavailable (${tr.reason})`;
        log.debug('  ↳ transcription skipped:', tr.reason);
      }
    }
  }

  // 2. Build a research query from the best signal we have.
  const query = buildQuery({ articles, userNote, text });
  log.info('  ↳ researching:', query);

  // 3. Research: find sources / citations.
  const researchResult = await research(query);

  // 4. Summarize everything into a cited briefing.
  log.info('  ↳ summarizing…');
  const reply = await summarize({ userNote, articles, research: researchResult });

  return {
    reply,
    meta: {
      urls,
      query,
      extracted: articles.filter((a) => a.ok).length,
      transcribed: articles.filter((a) => a.transcribed).length,
      sources: researchResult.results?.length || 0,
      researchOk: researchResult.ok,
    },
  };
}

function buildQuery({ articles, userNote, text }) {
  const firstGood = articles.find((a) => a.ok);
  if (firstGood) {
    // For social posts the title is generic ("Tweet by …"); the content is the
    // real signal. For articles the title is the best query seed.
    const social = firstGood.kind === 'tweet' || firstGood.kind === 'instagram';
    const basis = social
      ? firstGood.text || firstGood.title
      : firstGood.title || firstGood.text;
    const seed = (basis || '').replace(/\s+/g, ' ').trim().slice(0, 300);
    return userNote ? `${seed} — ${userNote}`.slice(0, 380) : seed;
  }
  // No usable extraction: fall back to the user's text (sans urls), else raw.
  return (userNote || text).slice(0, 380);
}
