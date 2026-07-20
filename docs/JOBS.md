# Job watcher — research + plan (not built yet)

Goal: watch company career pages for **software engineer / full-stack /
backend / frontend / AI engineer / forward-deployed engineer** (and related)
postings, and message new matches into the self-chat — the jobs equivalent of
[the news digest](./SOURCES.md), reusing the same plugin registry and store.

This document is the research + architecture plan. **No code has been
written for this feature yet** — per your ask, this is "populate the
companies + think it through," then we build the plugin together.

## What already existed

You had two files sitting in `sycamore/`, not yet in this repo:

- `AI_Engineer_Job_Search_BLR_HYD_PUNE.xlsx` — 4 sheets: a curated 18-row
  "best fit for 1 YOE" shortlist, a 49-row "confirmed hiring now" list, a
  134-row funded-startups sheet, and the big one — a **646-company master
  target list** (name, category, tier, likely city, a career-page link, a
  LinkedIn search link).
- `startups_export.csv` — a **209-row superset** of the xlsx's funded-startups
  sheet (all 134 xlsx rows plus 75 more, no overlap loss). This is the more
  current file for that segment.

Both are now copied into this repo as the seed data:
`data/companies.csv` (683 rows) and `data/funded-startups.csv` (209 rows).

## The corpus, audited

Of the 646 master-list companies, only **149 (23%) had a real direct link**;
the other 497 carried a "Google search — verify exact URL" placeholder
instead of a usable URL. The 209 funded startups had **no career-link column
at all**. So "populate more companies" turned out to mean two different
jobs: adding companies that were missing outright, and — the bigger one —
turning placeholder rows into pollable links.

I did the second one only for the sample that mattered for the architecture
decision (see below); resolving all 497 is real work I've scoped as Phase 1,
not done today.

### The architecture-deciding question: what actually serves each career page?

A page you can only scrape costs far more to maintain than one with a clean
JSON API behind it — this was the same fork the news digest hit with
RSS-vs-scrape. So I fetched all 149 direct links and sniffed what's really
serving them (redirect target + embedded-widget signature), then verified
the promising ones actually expose a public API by calling it for real:

| ATS | count (of 149) | verified public API |
|-----|----|----|
| **custom** (own-built page) | 121 | — scrape only |
| **Workday** | 11 | ✅ `POST /wday/cxs/{tenant}/{site}/jobs` — confirmed on NVIDIA, even accepts server-side `searchText` |
| **SuccessFactors** | 7 | not yet checked |
| **Oracle HCM** | 4 | not yet checked |
| **Phenom** | 3 | not yet checked |
| **Ashby** | 2 | ✅ `GET api.ashbyhq.com/posting-api/job-board/{org}` — confirmed |
| **Lever** | 1 | ✅ `GET api.lever.co/v0/postings/{org}?mode=json` — confirmed |

Then, since your target roles skew toward AI-native/modern companies rather
than the BFSI/enterprise-heavy master list, I hand-checked 36 well-known AI
labs, FDE employers, and coding-agent startups that were missing entirely.
**33 of 36 (92%) turned out to be on Ashby, Greenhouse, or Lever** — all
three now confirmed to expose clean public JSON:

```
Greenhouse:  boards-api.greenhouse.io/v1/boards/{org}/jobs        (confirmed live, e.g. anthropic)
Lever:       api.lever.co/v0/postings/{org}?mode=json             (confirmed live, e.g. palantir)
Ashby:       api.ashbyhq.com/posting-api/job-board/{org}          (confirmed live, e.g. ramp)
```

This is the single most important finding: **the companies you most want
(AI-native, FDE-heavy) are disproportionately on API-friendly ATS**, while
the companies hardest to watch (121 custom pages) are mostly large
enterprises/GCCs — lower priority for someone targeting AI Engineer / FDE
roles anyway.

### New companies added (33, all ATS-verified today)

Palantir, Anthropic, OpenAI, Perplexity, Ramp, Sierra, Cohere, Anduril,
Rippling, Deel, Notion, Linear, Vercel, Stripe, Airtable, Figma, DevRev,
Harvey, Writer, Together AI, Fireworks AI, Groq, Mistral AI, xAI,
Character.AI, ElevenLabs, Runway, Cursor (Anysphere), Windsurf (Codeium),
Replit, Simplismart, Rocketlane, Clari, Multiplier, Google DeepMind,
Zomato/Eternal, Multi On — the FDE-and-AI-coding-agent segment your existing
list didn't cover (it was compiled with an India-GCC / IT-services lens).
Cross-checked the existing 646 first so nothing's duplicated (confirmed the
list already had Zoho, Nvidia, Turing, Sarvam, Krutrim, Ola, Meta, Swiggy,
Freshworks, Postman, BrowserStack etc. under slightly different labels).

Full row-by-row detail: `data/companies.csv` (`source` column marks
`probe-verified-2026-07-20` vs `master-list-646`).

## Proposed architecture (mirrors the news digest)

```
src/jobSources.js    the company catalog, loaded from data/companies.csv
src/ats/
  greenhouse.js       GET boards-api.greenhouse.io/v1/boards/{org}/jobs
  lever.js            GET api.lever.co/v0/postings/{org}?mode=json
  ashby.js            GET api.ashbyhq.com/posting-api/job-board/{org}
  workday.js          POST {tenant}.wd#.myworkdayjobs.com/wday/cxs/.../jobs
src/jobs.js           poll → relevance filter → dedupe → deliver (same shape as news.js)
src/plugins/jobs.js   `jobs` on-demand, `jobs sources` listing — same pattern as news.js
```

Store: a new `store.jobs[]` array, same dedup-by-key discipline as
`store.news[]` (`key = company:externalJobId`, `digestedAt` gate).

### Relevance filtering — two stages, cheap first

1. **Keyword pre-filter** (free, in-process) against the job title: `software
   engineer|developer|full[- ]stack|backend|frontend|AI engineer|forward
   deployed|ML engineer|applied scientist|...`. Cuts a company's 200-job
   board down to the handful that could possibly match before anything
   touches an LLM.
2. **LLM relevance + seniority check** (cheap model, same pattern as the news
   digest's top-picks) only on keyword survivors — confirms it's really an
   IC engineering role (not "Sales Engineer" or "Engineering Manager, VP")
   and estimates whether the seniority band fits.

### Delivery — real-time-per-posting, not a daily digest

Jobs are time-sensitive in a way news isn't — early applicants have a real
edge, and a single day's batching could mean the difference between
applying and missing a closed req. So this should **poll continuously and
message you the moment a match appears**, reusing the reminder scheduler's
`setTimeout` loop shape but on a much shorter interval (e.g. every
20–30 min) rather than the news digest's once-a-day trigger. Open question
below — you may want a digest instead, or both.

## Open decisions (need your call before I build)

1. **Delivery cadence** — ping the instant a match is found, vs. a batched
   digest (e.g. every few hours, or once daily like the news feature)?
2. **Day-1 scope** — start with just the ~28 companies confirmed on a real
   API today (fast, cheap, reliable), or invest first in resolving more of
   the 497 placeholder rows so day-1 coverage is bigger? I'd lean toward
   "ship the ~28 now, expand weekly" so you start getting real signal
   immediately rather than waiting on a big resolution pass.
3. **Seniority band** — the original sheet was scoped to *your* 1 YOE. Keep
   that filter (skip senior/staff/lead reqs), or widen it since this
   message listed roles without a YOE qualifier?
4. **Custom-page companies** — the 121 companies with no API (includes some
   big names) only get scraping, which is more fragile and more
   maintenance per company than the ATS tiers. Worth hand-picking a small
   priority subset (a dozen or so) for scraping, or skip custom entirely
   and rely on the ATS-backed companies plus later resolution of the 497?

## Rollout plan (once decisions above are made)

- **Phase 1** — build the 4 ATS adapters + `jobs.js` engine + `jobs`
  plugin, wired to the ~28 already-verified companies. Offline smoke test
  (fixture-based, like `news-smoke.js`) + a live test against the real
  APIs before touching WhatsApp, then deploy.
- **Phase 2** — resolve a batch of the 497 placeholder rows to real URLs
  (prioritize the "AI-native Startup" and "Fintech" categories — most
  likely to be on Ashby/Greenhouse/Lever like the 33 verified today) and
  fold them in via `data/companies.csv`, no code changes needed.
- **Phase 3 (stretch)** — scraping for a hand-picked custom-page priority
  list, same pattern as the news digest's Anthropic/HF-Papers scrapers.
