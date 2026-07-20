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

## Decisions made (2026-07-20)

1. **Cadence: real-time.** Poll continuously (target ~20–30 min interval)
   and message the instant a match is found — not a batched digest. Jobs
   are time-sensitive in a way news isn't.
2. **Day-1 scope: resolve more first.** Rather than shipping the ~28
   hand-verified companies and expanding weekly, did a bulk resolution
   pass across the whole catalog before building anything — see below.
3. **Seniority: capture broadly, tag fit — don't filter.** Keep the
   original sheet's "Fit for Your 1 YOE" spirit (annotate Good
   fit/Stretch), but don't drop a company or posting just because it
   isn't junior-friendly. Every role-relevant IC posting gets surfaced;
   the fit label helps you triage, it doesn't gate delivery.
4. **Custom pages: use open-source ATS coverage instead of hand-rolled
   scrapers first.** See below — this changed the plan materially.

## Open-source discovery: `jobhive` (kalil0321/ats-scrapers)

Before writing scrapers for the 121+ "custom" companies, checked whether
prior art exists. It does: **[jobhive](https://github.com/kalil0321/ats-scrapers)**
is an MIT-licensed, actively maintained (386 commits, CI on Py 3.11–3.13)
project with reverse-engineered scrapers for **47 ATS platforms** —
including several we'd bucketed as "custom" because they don't advertise
an obvious API: SmartRecruiters, Workable, iCIMS, BambooHR, Oracle HCM,
SuccessFactors, Phenom, Avature, and more.

It's a Python library (`jobhive-py`), so not a direct dependency for this
Node project — but its scrapers document exactly which endpoint each ATS
exposes, which meant I could **port the same endpoints into our
dependency-free `fetch`-based style** without reverse-engineering them
from scratch. Verified live today (not just read from source):

| ATS | endpoint | verified against |
|-----|----------|----|
| Greenhouse | `GET boards-api.greenhouse.io/v1/boards/{slug}/jobs` | anthropic, deepmind, stripe |
| Lever | `GET api.lever.co/v0/postings/{slug}?mode=json` | palantir |
| Ashby | `GET api.ashbyhq.com/posting-api/job-board/{slug}` | ramp, openai |
| SmartRecruiters | `GET api.smartrecruiters.com/v1/companies/{slug}/postings` | visa |
| Workable | `GET apply.workable.com/api/v1/widget/accounts/{slug}` | monzo |
| Oracle HCM | `GET {tenant}.fa.ocs.oraclecloud.com/hcmRestApi/.../recruitingCEJobRequisitions` | Dell (349 live jobs, incl. "Advisory AI Architect (FDE Unit)") |
| Workday | `POST {tenant}.wd#.myworkdayjobs.com/wday/cxs/{tenant}/{site}/jobs` | NVIDIA (server-side `searchText` works) |

That's **7 confirmed-live adapters**, not 4 — SmartRecruiters, Workable,
and Oracle HCM joined the toolkit today. (SuccessFactors, Phenom, iCIMS
patterns are documented in jobhive too but not yet live-verified by us —
next-session work if a company needs them.)

## Bulk resolution pass — results

With 7 working adapters instead of 4, re-ran resolution across **all 618
previously-unresolved companies** (497 placeholder rows + 121 custom
pages), by guessing slugs (concatenated / hyphenated company name) against
Greenhouse, Lever, Ashby, SmartRecruiters, and Workable, and confirming
each hit for real (not just a 200 status).

**This caught two real false-positive bugs before they shipped**, worth
recording since they'll bite anyone doing this kind of slug-guessing:

- **Truncating a multi-word name to its first word is unsafe.**
  `"Applied Materials"` → slug `applied` hit a real Ashby board — for an
  unrelated self-driving startup ("Motion Planning (Fallback Stack)"),
  not the semiconductor giant. Fixed: slugs are always built from *all*
  words in the name; a bare single-word slug is only tried when the
  company's real name is genuinely one word.
- **BambooHR is fundamentally unsafe to auto-guess.** `"Seagate
  Technology"` → stopword-stripped to `seagate` → `seagate.bamboohr.com`
  returned a real, live jobs board — for a Coquitlam, BC construction
  company hiring a "Traveling Carpenter." BambooHR skews small/mid-size
  business and exposes no company-name field to cross-check against, so a
  same-word small business is genuinely likely to hold a slug a big name
  would want. **Dropped BambooHR from automated resolution entirely.**

After both fixes, hand-verified every `confidence: low` hit (single-word
company name, on an ATS with no name field to cross-check — Ashby/Lever)
by inspecting actual returned job titles against the company's known
domain. This caught two more real false positives that had already been
merged, and confirmed the rest:

| checked | verdict | evidence |
|---|---|---|
| Docker, Confluent, Gainsight, MetLife, CRED, Paytm, Zeta, Meesho, Sophos, Bureau, Upflow, Dozee, OpenAI, CodeRabbit, Ema, Composio | ✅ correct | titles/locations match the real company (e.g. Confluent → "Apache Kafka" roles; Paytm → Noida jobs; CRED → "Kuvera" a real CRED subsidiary) |
| **Porter** (master list, `lever/porter`) | ❌ wrong — reverted | actual postings: "Travel Nurse Practitioner," Massachusetts/Michigan — a US healthcare staffing company, not the Bangalore logistics company |
| **BarRaiser** (startups, `lever/barraiser`) | ❌ wrong — excluded | actual postings: "Bomb Cleaner," "Chief Executive Manager" — unrelated to the interview-as-a-service platform |
| **Craze** (startups, `ashby/craze`) | ❌ wrong — excluded | single unrelated "Video Editor @ Los Angeles" posting, no corroborating signal |

Net: **16 of 19 hand-checked `low`-confidence hits were correct (84%)**.
Good enough to keep the tier, bad enough that nothing tagged `low` should
be trusted without a glance — it's in the data specifically so that
glance is possible.

### Coverage: before → after

| | before | after |
|---|---|---|
| master list (683) — companies with a working ATS adapter | 60 | **122** |
| master list — `needs-resolution` (no link at all) | 497 | 452 |
| master list — `custom` (page confirmed, no known ATS) | 126 | 109 |
| funded startups (209) — companies with a working ATS adapter | 0 | **11** |

Pollable coverage roughly **doubled** on the master list (60 → 122 of 683)
from one afternoon of slug-guessing against 5 ATS types, and the 209
funded startups went from **zero** career links to 11 pollable — no
per-company manual research needed. `data/companies.csv` and
`data/funded-startups.csv` now carry `ats`, `career_url`, and `confidence`
columns.

## Rollout plan

- **Phase 1** — build 7 ATS adapters (not 4) + `jobs.js` engine + `jobs`
  plugin, wired to the now ~123+ resolved companies. Real-time delivery
  per the cadence decision: poll loop every 20–30 min, message on new
  match. Fit-tagging (Good fit / Stretch) reusing the keyword+LLM
  relevance pattern from the news digest. Offline smoke test + a live
  test against the real APIs before touching WhatsApp, then deploy.
- **Phase 2** — the 451 still-`needs-resolution` and 109 `custom` rows
  didn't hit a guessable slug; picking those up needs either a targeted
  web search per company or accepting they stay uncovered. Not blocking
  Phase 1 — the resolved set already covers most of the AI-native/FDE
  segment you actually care about.
- **Phase 3 (stretch)** — hand-picked scraping for the highest-priority
  handful of true-custom companies (OpenAI-adjacent labs that turn out to
  have no ATS at all, or specific must-watch big names), same pattern as
  the news digest's Anthropic scraper.
