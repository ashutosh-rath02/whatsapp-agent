import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import OpenAI from 'openai';
import { config } from './config.js';
import { log } from './logger.js';
import { BROWSER_UA } from './html.js';

let client;
function getClient() {
  if (!client) client = new OpenAI({ apiKey: config.llm.openai.apiKey, timeout: 120_000, maxRetries: 2 });
  return client;
}

const CT_EXT = {
  'video/mp4': '.mp4',
  'audio/mp4': '.m4a',
  'audio/mpeg': '.mp3',
  'audio/m4a': '.m4a',
  'audio/wav': '.wav',
  'audio/x-wav': '.wav',
  'audio/webm': '.webm',
  'video/webm': '.webm',
  'audio/ogg': '.ogg',
};

/**
 * Download a media URL (size-capped) and transcribe its speech with Whisper.
 * @returns {Promise<{ ok: boolean, text?: string, reason?: string }>}
 */
export async function transcribeUrl(mediaUrl) {
  if (!config.transcription.enabled) return { ok: false, reason: 'transcription disabled' };
  if (!mediaUrl) return { ok: false, reason: 'no media url' };

  let tmpPath;
  try {
    const { buffer, ext } = await download(mediaUrl, config.transcription.maxBytes);
    tmpPath = path.join(os.tmpdir(), `wa-agent-${crypto.randomUUID()}${ext}`);
    await fs.promises.writeFile(tmpPath, buffer);

    const t0 = Date.now();
    const res = await getClient().audio.transcriptions.create({
      file: fs.createReadStream(tmpPath),
      model: config.transcription.model,
    });
    const text = (res?.text || '').trim();
    log.debug(`transcribed ${Math.round(buffer.length / 1024)}KB in ${Date.now() - t0}ms`);
    if (!text) return { ok: false, reason: 'empty transcript' };
    return { ok: true, text };
  } catch (err) {
    log.debug('transcribeUrl failed', err?.message);
    return { ok: false, reason: err?.message || 'transcription error' };
  } finally {
    if (tmpPath) fs.promises.unlink(tmpPath).catch(() => {});
  }
}

async function download(url, maxBytes) {
  const ctrl = new AbortController();
  const to = setTimeout(() => ctrl.abort(), 60_000);
  try {
    const res = await fetch(url, {
      headers: { 'user-agent': BROWSER_UA },
      redirect: 'follow',
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`download http ${res.status}`);

    const declared = Number(res.headers.get('content-length') || 0);
    if (declared && declared > maxBytes) {
      throw new Error(`media too large (${Math.round(declared / 1e6)}MB > ${Math.round(maxBytes / 1e6)}MB)`);
    }

    const buffer = Buffer.from(await res.arrayBuffer());
    if (buffer.length > maxBytes) {
      throw new Error(`media too large (${Math.round(buffer.length / 1e6)}MB)`);
    }

    const ct = (res.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
    const ext = CT_EXT[ct] || extFromUrl(url) || '.mp4';
    return { buffer, ext };
  } finally {
    clearTimeout(to);
  }
}

function extFromUrl(url) {
  try {
    const p = new URL(url).pathname;
    const m = p.match(/\.(mp4|m4a|mp3|wav|webm|ogg|oga)$/i);
    return m ? `.${m[1].toLowerCase()}` : null;
  } catch {
    return null;
  }
}
