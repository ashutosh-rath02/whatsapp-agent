// The job-watch engine: polls every company's ATS, filters to relevant
// roles, dedupes into the store, and delivers matches into the self-chat
// in real time (every poll cycle, not batched into a daily digest — a job
// posting is time-sensitive in a way news isn't).
import { config } from './config.js';
import { log } from './logger.js';
import { loadCompanies } from './jobSources.js';
import { fetchJobs } from './ats/index.js';
import { isRelevant, fitFor, isIndiaLocation } from './jobRelevance.js';
import { addJobs, pendingJobs, markJobsDelivered, reload } from './store.js';
import { sendPush } from './push.js';
import { trunc } from './format.js';

function hash(s = '') {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

/**
 * Poll every company; store newly-seen relevant postings.
 * @returns {Promise<{ added: number, polled: number, failed: string[] }>}
 */
export async function collectJobs() {
  reload(); // pick up any writes made by another process (e.g. a --seed run) since our last cycle
  const companies = loadCompanies();
  const failed = [];
  let added = 0;

  const queue = [...companies];
  async function worker() {
    for (let co = queue.shift(); co; co = queue.shift()) {
      try {
        const raw = await fetchJobs(co);
        const relevant = raw.filter((j) => isRelevant(j.title) && isIndiaLocation(j.location));
        const stored = addJobs(
          relevant.map((j) => ({
            key: `${co.ats}:${co.slug || co.careerUrl}:${hash(j.id)}`,
            company: co.name,
            title: trunc(j.title, 120),
            url: j.url,
            location: trunc(j.location || '', 60),
            fit: fitFor(j.title),
          })),
        );
        added += stored.length;
        log.debug(`jobs: ${co.name} → ${raw.length} postings, ${relevant.length} relevant, ${stored.length} new`);
      } catch (e) {
        failed.push(co.name);
        log.debug(`jobs: ${co.name} failed — ${e?.message}`);
      }
    }
  }
  // Higher concurrency than the news poll — ~130 companies vs ~56 feeds,
  // and each ATS call is a single small JSON fetch.
  await Promise.all(Array.from({ length: 10 }, worker));

  if (failed.length) log.debug(`jobs: ${failed.length}/${companies.length} companies failed this cycle`);
  log.info(`💼 collected: ${added} new relevant posting(s) from ${companies.length} companies`);
  return { added, polled: companies.length, failed };
}

/**
 * Format pending (undelivered) postings into a WhatsApp message. Capped at
 * config.jobs.maxPerMessage — a single company can post the same role open
 * across a dozen cities, which would otherwise wall the chat with one
 * message. Everything pending is still marked delivered either way (shown
 * or capped out), so nothing capped this cycle gets re-sent next cycle.
 */
export function buildJobsMessage() {
  const pending = pendingJobs();
  if (!pending.length) return null;
  pending.sort((a, b) => a.company.localeCompare(b.company));
  const shown = pending.slice(0, config.jobs.maxPerMessage);

  const lines = [`💼 *${pending.length} new job posting(s)*`, ''];
  for (const j of shown) {
    lines.push(`*${j.company}* — ${j.title}`);
    const meta = [j.fit, j.location].filter(Boolean).join(' · ');
    if (meta) lines.push(`_${meta}_`);
    lines.push(j.url, '');
  }
  const skipped = pending.length - shown.length;
  if (skipped > 0) lines.push(`_+${skipped} more this cycle — check the dashboard or \`jobs\` again later._`);
  return { text: lines.join('\n').trim(), keys: pending.map((j) => j.key), count: pending.length };
}

/** Collect + build + mark. Shared by the scheduler and the `jobs` command. */
export async function runJobsCycle() {
  await collectJobs();
  const msg = buildJobsMessage();
  if (!msg) return null;
  return { text: msg.text, count: msg.count, commit: () => markJobsDelivered(msg.keys) };
}

export function startJobsScheduler(client, getNotifyTarget) {
  const pollMs = config.jobs.pollMs;
  let stopped = false;
  let running = false;
  let timer = null;

  async function tick() {
    if (stopped) return;
    try {
      if (!running) {
        running = true;
        const cycle = await runJobsCycle();
        if (cycle) {
          const chatId = getNotifyTarget();
          if (!chatId) {
            log.warn('jobs: new posting(s) found but self-chat id unknown yet — will retry next cycle');
          } else {
            await client.sendMessage(chatId, `${config.agent.replyMarker}\n\n${cycle.text}`);
            cycle.commit();
            await sendPush('Job Matches', `${cycle.count} new India posting(s) — open WhatsApp for details`, { tags: ['briefcase'], priority: 4 });
            log.info('💼 delivered new job posting(s)');
          }
        }
        running = false;
      }
    } catch (e) {
      running = false;
      log.error('jobs cycle failed:', e?.message);
    } finally {
      if (!stopped) timer = setTimeout(tick, pollMs);
    }
  }

  timer = setTimeout(tick, 15_000); // let the client settle after ready
  log.info(`💼 job watcher on (every ${Math.round(pollMs / 60000)} min, ${loadCompanies().length} companies)`);
  return () => {
    stopped = true;
    if (timer) clearTimeout(timer);
  };
}
