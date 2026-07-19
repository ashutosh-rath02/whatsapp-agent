# Watch sources — catalog for the news/watch feature

> **The live catalog is [`src/newsSources.js`](../src/newsSources.js)** — that's
> what the digest actually polls. This document is the audit trail of what was
> probed and what was found.

Curated list of streams the agent can poll for new AI developments.
Every "rss/atom" entry below was **probe-verified on 2026-07-19** (from this
machine and cross-checked from the EC2 box, where the agent actually runs).
"scrape" means the page is reachable but publishes no feed — the watcher needs
HTML diffing for those, so they cost more to support.

**Principle:** watch *streams*, not pages. One-off articles (an arXiv abstract,
a single blog post) are inputs for `save`/research, not for watching. This
catalog maps everything to the parent stream that produces new items.

## Recommended starter set (⭐)

High signal, low overlap, and all but two are feed-based (cheap + reliable to
parse). Covers: model releases, agent tooling, practitioner analysis, industry
news, and papers — without drowning in duplicates.

| ⭐ | Source | Why | Access |
|---|--------|-----|--------|
| ⭐ | OpenAI News | primary model/product announcements | rss `https://openai.com/news/rss.xml` |
| ⭐ | Anthropic News + Engineering | primary; no feed — the one scrape worth doing | scrape `anthropic.com/news`, `/engineering` |
| ⭐ | Google DeepMind | primary | rss `https://deepmind.google/blog/rss.xml` |
| ⭐ | Mistral | primary, open-weights | rss `https://mistral.ai/rss.xml` |
| ⭐ | Qwen | primary, open-weights | atom `https://qwenlm.github.io/blog/index.xml` |
| ⭐ | Hugging Face Blog | OSS model/tooling releases | rss `https://huggingface.co/blog/feed.xml` |
| ⭐ | HF Daily Papers | human-curated papers — arXiv signal without the firehose | scrape `https://huggingface.co/papers` |
| ⭐ | LangChain Blog | agent-framework development | rss `https://blog.langchain.com/rss.xml` |
| ⭐ | MCP Blog | protocol changes affect this project directly | atom `https://blog.modelcontextprotocol.io/index.xml` |
| ⭐ | Simon Willison | fastest practitioner coverage of anything agent/LLM | atom `https://simonwillison.net/atom/entries/` (posts only; `/atom/everything/` adds links — chattier) |
| ⭐ | Interconnects (Nathan Lambert) | model/lab analysis, weekly-ish | rss `https://www.interconnects.ai/feed` |
| ⭐ | Latent Space | AI-engineering trends | rss `https://www.latent.space/feed` |
| ⭐ | TechCrunch AI | breaking industry/business news | rss `https://techcrunch.com/category/artificial-intelligence/feed/` |

## Full catalog

### Tier 1 — Primary labs / model makers

| Source | Cadence | Access |
|--------|---------|--------|
| OpenAI News | ~3/wk | rss `https://openai.com/news/rss.xml` |
| Anthropic News / Engineering | ~2/wk | **scrape** (no feed exists) |
| Google DeepMind | ~2/wk | rss `https://deepmind.google/blog/rss.xml` |
| Google AI Blog | ~daily | rss `https://blog.google/technology/ai/rss/` |
| Meta AI Blog | ~2/wk | **scrape** (rss returns 400) |
| Mistral News | ~1/wk | rss `https://mistral.ai/rss.xml` |
| Qwen Blog | bursty | atom `https://qwenlm.github.io/blog/index.xml` |
| xAI News | ~1/wk | **scrape** |
| Microsoft Research Blog | ~2/wk | rss `https://www.microsoft.com/en-us/research/feed/` |
| Hugging Face Blog | ~daily | rss `https://huggingface.co/blog/feed.xml` |
| Together AI Blog | ~2/wk | rss `https://www.together.ai/blog/rss.xml` |

### Tier 2 — Agent tooling / infra blogs

| Source | Focus | Access |
|--------|-------|--------|
| LangChain Blog | frameworks, state-of-agents reports | rss `https://blog.langchain.com/rss.xml` |
| MCP Blog | protocol | atom `https://blog.modelcontextprotocol.io/index.xml` |
| vLLM Blog | inference | atom `https://vllm.ai/blog/atom.xml` |
| Zep Blog | agent memory / temporal KGs | rss `https://blog.getzep.com/rss/` |
| Arize Blog | evals/observability | rss `https://arize.com/feed/` (works from EC2; flaky from office network) |
| LlamaIndex Blog | RAG/agents | scrape `https://www.llamaindex.ai/blog` |
| Letta Blog | agent memory (MemGPT) | scrape `https://www.letta.com/blog` |
| Langfuse Blog | observability | scrape `https://langfuse.com/blog` |
| mem0 Blog | agent memory | scrape `https://mem0.ai/blog` |
| Braintrust Blog | evals | scrape `https://www.braintrust.dev/blog` |
| Galileo Blog | evals | scrape `https://galileo.ai/blog` |
| Confident AI Blog | evals (DeepEval) | scrape `https://www.confident-ai.com/blog` |
| Firecrawl Blog | web-for-agents | scrape `https://www.firecrawl.dev/blog` |
| Pinecone Learn | vector/RAG | scrape `https://www.pinecone.io/learn/` |
| Ollama Blog | local models | scrape `https://ollama.com/blog` |
| Cursor Blog | coding agents | scrape `https://cursor.com/blog` |

### Tier 3 — Practitioners & newsletters (all have feeds)

| Source | Cadence | Access |
|--------|---------|--------|
| Simon Willison | daily+ | atom `https://simonwillison.net/atom/entries/` |
| Ahead of AI (Raschka) | ~1/wk | rss `https://magazine.sebastianraschka.com/feed` |
| Interconnects | ~2/wk | rss `https://www.interconnects.ai/feed` |
| Latent Space | ~2/wk | rss `https://www.latent.space/feed` |
| Import AI (Jack Clark) | ~1/wk | rss `https://importai.substack.com/feed` |
| Chip Huyen | ~1/mo | rss `https://huyenchip.com/feed.xml` |
| Eugene Yan | ~1/mo | rss `https://eugeneyan.com/rss/` |
| Lilian Weng | ~1/quarter | atom `https://lilianweng.github.io/index.xml` |
| Hamel Husain | ~1/mo | scrape `https://hamel.dev/` (no feed found) |

### Tier 4 — News / analysis

| Source | Cadence | Access |
|--------|---------|--------|
| TechCrunch AI | ~10/day | rss `https://techcrunch.com/category/artificial-intelligence/feed/` |
| The Verge AI | ~5/day | rss `https://www.theverge.com/rss/ai-artificial-intelligence/index.xml` |
| VentureBeat AI | ~5/day | rss `https://venturebeat.com/category/ai/feed/` |
| Ars Technica | site-wide; filter AI category | rss `https://feeds.arstechnica.com/arstechnica/index` |
| MIT Tech Review | site-wide; filter AI category | rss `https://www.technologyreview.com/feed/` |
| O'Reilly Radar | ~2/wk | rss `https://www.oreilly.com/radar/feed/` |
| BAIR Blog | ~1/mo | rss `https://bair.berkeley.edu/blog/feed` |
| The Batch (deeplearning.ai) | weekly | scrape `https://www.deeplearning.ai/the-batch/` |

### Tier 5 — Research firehoses (need an LLM relevance filter before use)

| Source | Volume | Access |
|--------|--------|--------|
| arXiv cs.AI | 100s/day | rss `https://rss.arxiv.org/rss/cs.AI` |
| arXiv cs.CL | 100s/day | rss `https://rss.arxiv.org/rss/cs.CL` |
| arXiv cs.MA (multi-agent) | ~10/day | rss `https://rss.arxiv.org/rss/cs.MA` |
| Hacker News | filtered search | **API** `https://hn.algolia.com/api/v1/search_by_date?query=...&numericFilters=points>100` (hnrss.org is 502/dead — use the official Algolia JSON API) |

### GitHub repos — free built-in feeds

Every repo ships Atom feeds; no scraping needed. Pattern:

- Releases: `https://github.com/<owner>/<repo>/releases.atom`
- Commits: `https://github.com/<owner>/<repo>/commits/<branch>.atom`

Worth watching: `modelcontextprotocol/modelcontextprotocol`,
`langchain-ai/langchain`, `getzep/graphiti`, `mem0ai/mem0`,
`chaosync-org/awesome-ai-agent-testing` (a growing catalog — commits feed).

## Second probe batch (2026-07-19) — 29 more verified feeds

| Source | Access |
|--------|--------|
| Google Research | rss `https://research.google/blog/rss/` |
| Apple ML Research | rss `https://machinelearning.apple.com/rss.xml` |
| Amazon Science | rss `https://www.amazon.science/index.rss` |
| NVIDIA AI (gen-AI category) | rss `https://blogs.nvidia.com/blog/category/generative-ai/feed/` |
| NVIDIA Dev Blog | rss `https://developer.nvidia.com/blog/feed` (high volume, mixed) |
| Sakana AI | rss `https://sakana.ai/feed` |
| EleutherAI | rss `https://blog.eleuther.ai/index.xml` |
| CrewAI | rss `https://blog.crewai.com/rss/` |
| Qdrant | rss `https://qdrant.tech/blog/index.xml` |
| Weaviate | atom `https://weaviate.io/blog/atom.xml` |
| Haystack | rss `https://haystack.deepset.ai/blog/index.xml` |
| Databricks | rss `https://www.databricks.com/blog/feed.xml` (mixed data/AI) |
| Cloudflare AI tag | rss `https://blog.cloudflare.com/tag/ai/rss/` |
| GitHub AI & ML | rss `https://github.blog/ai-and-ml/feed/` |
| Vercel | rss `https://vercel.com/blog/rss` (mixed) |
| Replit | rss `https://blog.replit.com/feed.xml` |
| Karpathy | atom `https://karpathy.bearblog.dev/feed/` |
| One Useful Thing (Mollick) | rss `https://www.oneusefulthing.org/feed` |
| Zvi Mowshowitz | rss `https://thezvi.substack.com/feed` |
| SemiAnalysis | rss `https://semianalysis.com/feed/` |
| Dwarkesh Podcast | rss `https://www.dwarkesh.com/feed` |
| ChinaTalk | rss `https://www.chinatalk.media/feed` |
| The Gradient | rss `https://thegradient.pub/rss/` |
| Last Week in AI | rss `https://lastweekin.ai/feed` |
| AI Snake Oil | rss `https://www.aisnakeoil.com/feed` |
| MIT News AI topic | rss `https://news.mit.edu/rss/topic/artificial-intelligence2` |
| Alignment Forum | rss `https://www.alignmentforum.org/feed.xml` |
| r/LocalLLaMA | atom `https://www.reddit.com/r/LocalLLaMA/.rss` (verified from EC2; r/MachineLearning got rate-limited) |
| Anthropic Alignment | **scrape** `https://alignment.anthropic.com/` (no feed) |

No feed / unreachable in batch 2: Cohere, IBM Research, Allen AI, Modal
(unreachable to probes); AI21, Groq, Fireworks, Stability, Epoch AI, METR,
Sourcegraph, Stanford HAI, W&B, OpenAI Research page (scrape-only).

## Excluded (for now) and why

- **X/Twitter** — no feeds, aggressive auth wall; revisit only via nitter-style mirrors (fragile).
- **Email-only newsletters** (AlphaSignal, TLDR AI) — need an inbox integration; their content overlaps Tier 3/4 anyway.
- **YouTube channels** — feasible later (`https://www.youtube.com/feeds/videos.xml?channel_id=…`) but needs transcription to be useful.
- **One-off market reports** (StackOne map, Sky9, DataRobot survey) — snapshots, not streams; their parent blogs are marketing-cadence and low signal.

## Implementation notes for the watch plugin (when we build it)

- **RSS-first.** 33 of 50 probed sources have working feeds; feeds give stable
  IDs, timestamps, and titles for free. Scraping is the fallback, not the norm.
- Poll with **conditional GET** (ETag / Last-Modified) — most feeds 304 and cost nothing.
- **Dedup by canonical URL + title hash** in the JSON store (`seen` set per source);
  cross-source dedup matters because Tier 4 outlets all cover the same launches.
- The **reminder scheduler is already the cron loop** — a daily digest is a new
  job type, not new infrastructure.
- Firehoses (arXiv, HN) go through a **cheap LLM relevance filter**
  (gpt-4o-mini, "is this about agents/LLMs the user cares about?") before
  entering the digest; feed sources mostly don't need it.
