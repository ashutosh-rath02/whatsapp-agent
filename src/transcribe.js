import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import OpenAI from 'openai';
import { config } from './config.js';
import { log } from './logger.js';
import { BROWSER_UA } from './html.js';

const execFileP = promisify(execFile);

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
 * Transcribe the audio of an extracted item. Prefers a direct media URL (e.g.
 * a tweet's public MP4 — no auth); otherwise falls back to yt-dlp for
 * login-gated sites like Instagram reels (needs cookies — see config).
 * @param {{ url: string, videoUrl?: string|null, kind?: string }} item
 * @returns {Promise<{ ok: boolean, text?: string, reason?: string, via?: string }>}
 */
export async function transcribeMedia(item) {
  if (!config.transcription.enabled) return { ok: false, reason: 'transcription disabled' };

  if (item.videoUrl) {
    const r = await transcribeUrl(item.videoUrl);
    if (r.ok) return { ...r, via: 'direct' };
    // fall through to yt-dlp if a direct download didn't pan out
  }
  if (isYtDlpCandidate(item)) {
    const r = await transcribeViaYtDlp(item.url);
    return r.ok ? { ...r, via: 'yt-dlp' } : r;
  }
  return { ok: false, reason: 'no transcribable media' };
}

function isYtDlpCandidate(item) {
  if (item.kind === 'instagram') return /\/(reel|reels|tv)\//i.test(item.url);
  return false;
}

/**
 * Download a direct media URL (size-capped) and transcribe with Whisper.
 * @returns {Promise<{ ok: boolean, text?: string, reason?: string }>}
 */
export async function transcribeUrl(mediaUrl) {
  if (!mediaUrl) return { ok: false, reason: 'no media url' };
  let tmpPath;
  try {
    const { buffer, ext } = await download(mediaUrl, config.transcription.maxBytes);
    tmpPath = path.join(os.tmpdir(), `wa-agent-${crypto.randomUUID()}${ext}`);
    await fs.promises.writeFile(tmpPath, buffer);
    const text = await whisperFile(tmpPath, buffer.length);
    return text ? { ok: true, text } : { ok: false, reason: 'empty transcript' };
  } catch (err) {
    log.debug('transcribeUrl failed', err?.message);
    return { ok: false, reason: err?.message || 'transcription error' };
  } finally {
    if (tmpPath) fs.promises.unlink(tmpPath).catch(() => {});
  }
}

/**
 * Use yt-dlp to fetch a login-gated video's audio, then transcribe it.
 */
async function transcribeViaYtDlp(pageUrl) {
  const ytdlp = await resolveYtDlp();
  if (!ytdlp) return { ok: false, reason: 'yt-dlp not installed' };

  const dir = path.join(os.tmpdir(), `wa-agent-${crypto.randomUUID()}`);
  await fs.promises.mkdir(dir, { recursive: true });
  try {
    const args = [
      '-q', '--no-warnings', '--no-playlist',
      '-f', 'ba/bestaudio/best',
      '-x', '--audio-format', 'mp3', '--audio-quality', '5',
      '-o', path.join(dir, 'audio.%(ext)s'),
    ];
    const { ytdlpCookiesFile, ytdlpCookiesBrowser } = config.transcription;
    if (ytdlpCookiesFile) args.push('--cookies', ytdlpCookiesFile);
    else if (ytdlpCookiesBrowser) args.push('--cookies-from-browser', ytdlpCookiesBrowser);
    args.push(pageUrl);

    await execFileP(ytdlp, args, { timeout: 120_000, maxBuffer: 16 * 1024 * 1024 });

    const file = (await fs.promises.readdir(dir)).find((f) => f.startsWith('audio.'));
    if (!file) return { ok: false, reason: 'yt-dlp produced no audio' };
    const p = path.join(dir, file);
    const size = (await fs.promises.stat(p)).size;
    if (size > config.transcription.maxBytes) return { ok: false, reason: 'audio too large' };

    const text = await whisperFile(p, size);
    return text ? { ok: true, text } : { ok: false, reason: 'empty transcript' };
  } catch (err) {
    const msg = (err?.stderr || err?.message || 'yt-dlp error').toString();
    const reason = /login|cookies|empty media|rate.?limit/i.test(msg)
      ? 'instagram login required (set YTDLP_COOKIES_FILE)'
      : msg.split('\n')[0].slice(0, 160);
    log.debug('transcribeViaYtDlp failed', msg.slice(0, 300));
    return { ok: false, reason };
  } finally {
    fs.promises.rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

async function whisperFile(filePath, bytes) {
  const t0 = Date.now();
  const res = await getClient().audio.transcriptions.create({
    file: fs.createReadStream(filePath),
    model: config.transcription.model,
  });
  log.debug(`transcribed ${Math.round((bytes || 0) / 1024)}KB in ${Date.now() - t0}ms`);
  return (res?.text || '').trim();
}

let _ytdlp; // cached path | null
async function resolveYtDlp() {
  if (_ytdlp !== undefined) return _ytdlp;
  try {
    const finder = process.platform === 'win32' ? 'where' : 'which';
    const { stdout } = await execFileP(finder, ['yt-dlp']);
    _ytdlp = stdout.split(/\r?\n/)[0].trim() || null;
  } catch {
    _ytdlp = null;
  }
  log.debug('yt-dlp resolved to', _ytdlp || 'NOT FOUND');
  return _ytdlp;
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
