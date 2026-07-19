// The watch catalog — every stream the news digest polls. Probe-verified on
// 2026-07-19 (see docs/SOURCES.md for the full audit trail).
//
//   kind: 'rss'    → url is a feed; parsed by feeds.js
//         'scrape' → url is HTML; anchors matching linkRe become items
//         'hn'     → Algolia HN search API (JSON)
//   tier: groups the digest sections; also sets per-source item caps.
//   star: starter-set sources get 3 slots in the digest (others 2).
//
// Disable any source without a rebuild: NEWS_SOURCES_DISABLED=hf-blog,verge

export const TIERS = {
  labs: '🧪 Labs & models',
  tooling: '🛠️ Agent tooling',
  papers: '📚 Papers',
  voices: '✍️ Practitioners',
  news: '📰 Industry news',
  community: '🌐 Community',
};

export const SOURCES = [
  // ── Tier 1: labs / model makers ────────────────────────────────────────────
  { id: 'openai', name: 'OpenAI', tier: 'labs', kind: 'rss', url: 'https://openai.com/news/rss.xml', star: true },
  { id: 'anthropic', name: 'Anthropic', tier: 'labs', kind: 'scrape', url: 'https://www.anthropic.com/news',
    linkRe: 'href="(/news/[a-z0-9-]+)"', base: 'https://www.anthropic.com', star: true },
  { id: 'anthropic-eng', name: 'Anthropic Engineering', tier: 'labs', kind: 'scrape', url: 'https://www.anthropic.com/engineering',
    linkRe: 'href="(/engineering/[a-z0-9-]+)"', base: 'https://www.anthropic.com', star: true },
  { id: 'deepmind', name: 'DeepMind', tier: 'labs', kind: 'rss', url: 'https://deepmind.google/blog/rss.xml', star: true },
  { id: 'google-ai', name: 'Google AI', tier: 'labs', kind: 'rss', url: 'https://blog.google/technology/ai/rss/' },
  { id: 'mistral', name: 'Mistral', tier: 'labs', kind: 'rss', url: 'https://mistral.ai/rss.xml', star: true },
  { id: 'qwen', name: 'Qwen', tier: 'labs', kind: 'rss', url: 'https://qwenlm.github.io/blog/index.xml', star: true },
  { id: 'msr', name: 'Microsoft Research', tier: 'labs', kind: 'rss', url: 'https://www.microsoft.com/en-us/research/feed/' },
  { id: 'hf-blog', name: 'Hugging Face', tier: 'labs', kind: 'rss', url: 'https://huggingface.co/blog/feed.xml', star: true },
  { id: 'together', name: 'Together AI', tier: 'labs', kind: 'rss', url: 'https://www.together.ai/blog/rss.xml' },
  { id: 'google-research', name: 'Google Research', tier: 'labs', kind: 'rss', url: 'https://research.google/blog/rss/' },
  { id: 'apple-ml', name: 'Apple ML', tier: 'labs', kind: 'rss', url: 'https://machinelearning.apple.com/rss.xml' },
  { id: 'amazon-science', name: 'Amazon Science', tier: 'labs', kind: 'rss', url: 'https://www.amazon.science/index.rss' },
  { id: 'nvidia-ai', name: 'NVIDIA AI', tier: 'labs', kind: 'rss', url: 'https://blogs.nvidia.com/blog/category/generative-ai/feed/' },
  { id: 'sakana', name: 'Sakana AI', tier: 'labs', kind: 'rss', url: 'https://sakana.ai/feed' },
  { id: 'eleuther', name: 'EleutherAI', tier: 'labs', kind: 'rss', url: 'https://blog.eleuther.ai/index.xml' },

  // ── Tier 2: agent tooling / infra ──────────────────────────────────────────
  { id: 'langchain', name: 'LangChain', tier: 'tooling', kind: 'rss', url: 'https://blog.langchain.com/rss.xml', star: true },
  { id: 'mcp', name: 'MCP Blog', tier: 'tooling', kind: 'rss', url: 'https://blog.modelcontextprotocol.io/index.xml', star: true },
  { id: 'vllm', name: 'vLLM', tier: 'tooling', kind: 'rss', url: 'https://vllm.ai/blog/atom.xml' },
  { id: 'zep', name: 'Zep', tier: 'tooling', kind: 'rss', url: 'https://blog.getzep.com/rss/' },
  { id: 'arize', name: 'Arize', tier: 'tooling', kind: 'rss', url: 'https://arize.com/feed/' },
  { id: 'crewai', name: 'CrewAI', tier: 'tooling', kind: 'rss', url: 'https://blog.crewai.com/rss/' },
  { id: 'qdrant', name: 'Qdrant', tier: 'tooling', kind: 'rss', url: 'https://qdrant.tech/blog/index.xml' },
  { id: 'weaviate', name: 'Weaviate', tier: 'tooling', kind: 'rss', url: 'https://weaviate.io/blog/atom.xml' },
  { id: 'haystack', name: 'Haystack', tier: 'tooling', kind: 'rss', url: 'https://haystack.deepset.ai/blog/index.xml' },
  { id: 'cloudflare-ai', name: 'Cloudflare AI', tier: 'tooling', kind: 'rss', url: 'https://blog.cloudflare.com/tag/ai/rss/' },
  { id: 'github-ai', name: 'GitHub AI Blog', tier: 'tooling', kind: 'rss', url: 'https://github.blog/ai-and-ml/feed/' },
  { id: 'replit', name: 'Replit', tier: 'tooling', kind: 'rss', url: 'https://blog.replit.com/feed.xml' },

  // ── Papers ─────────────────────────────────────────────────────────────────
  { id: 'hf-papers', name: 'HF Daily Papers', tier: 'papers', kind: 'scrape', url: 'https://huggingface.co/papers',
    linkRe: 'href="(/papers/\\d{4}\\.\\d{4,5})"', base: 'https://huggingface.co', star: true },
  { id: 'arxiv-ma', name: 'arXiv cs.MA', tier: 'papers', kind: 'rss', url: 'https://rss.arxiv.org/rss/cs.MA' },

  // ── Tier 3: practitioners & newsletters ────────────────────────────────────
  { id: 'simonw', name: 'Simon Willison', tier: 'voices', kind: 'rss', url: 'https://simonwillison.net/atom/entries/', star: true },
  { id: 'raschka', name: 'Ahead of AI', tier: 'voices', kind: 'rss', url: 'https://magazine.sebastianraschka.com/feed' },
  { id: 'interconnects', name: 'Interconnects', tier: 'voices', kind: 'rss', url: 'https://www.interconnects.ai/feed', star: true },
  { id: 'latent-space', name: 'Latent Space', tier: 'voices', kind: 'rss', url: 'https://www.latent.space/feed', star: true },
  { id: 'import-ai', name: 'Import AI', tier: 'voices', kind: 'rss', url: 'https://importai.substack.com/feed' },
  { id: 'chip-huyen', name: 'Chip Huyen', tier: 'voices', kind: 'rss', url: 'https://huyenchip.com/feed.xml' },
  { id: 'eugene-yan', name: 'Eugene Yan', tier: 'voices', kind: 'rss', url: 'https://eugeneyan.com/rss/' },
  { id: 'lilian-weng', name: 'Lilian Weng', tier: 'voices', kind: 'rss', url: 'https://lilianweng.github.io/index.xml' },
  { id: 'karpathy', name: 'Karpathy', tier: 'voices', kind: 'rss', url: 'https://karpathy.bearblog.dev/feed/', star: true },
  { id: 'mollick', name: 'One Useful Thing', tier: 'voices', kind: 'rss', url: 'https://www.oneusefulthing.org/feed' },
  { id: 'zvi', name: 'Zvi Mowshowitz', tier: 'voices', kind: 'rss', url: 'https://thezvi.substack.com/feed' },
  { id: 'semianalysis', name: 'SemiAnalysis', tier: 'voices', kind: 'rss', url: 'https://semianalysis.com/feed/' },
  { id: 'dwarkesh', name: 'Dwarkesh Podcast', tier: 'voices', kind: 'rss', url: 'https://www.dwarkesh.com/feed' },
  { id: 'gradient', name: 'The Gradient', tier: 'voices', kind: 'rss', url: 'https://thegradient.pub/rss/' },
  { id: 'lastweek', name: 'Last Week in AI', tier: 'voices', kind: 'rss', url: 'https://lastweekin.ai/feed' },
  { id: 'chinatalk', name: 'ChinaTalk', tier: 'voices', kind: 'rss', url: 'https://www.chinatalk.media/feed' },
  { id: 'snakeoil', name: 'AI Snake Oil', tier: 'voices', kind: 'rss', url: 'https://www.aisnakeoil.com/feed' },

  // ── Tier 4: industry news ──────────────────────────────────────────────────
  { id: 'techcrunch', name: 'TechCrunch AI', tier: 'news', kind: 'rss', url: 'https://techcrunch.com/category/artificial-intelligence/feed/', star: true },
  { id: 'verge', name: 'The Verge AI', tier: 'news', kind: 'rss', url: 'https://www.theverge.com/rss/ai-artificial-intelligence/index.xml' },
  { id: 'venturebeat', name: 'VentureBeat AI', tier: 'news', kind: 'rss', url: 'https://venturebeat.com/category/ai/feed/' },
  { id: 'oreilly', name: "O'Reilly Radar", tier: 'news', kind: 'rss', url: 'https://www.oreilly.com/radar/feed/' },
  { id: 'bair', name: 'BAIR', tier: 'news', kind: 'rss', url: 'https://bair.berkeley.edu/blog/feed' },
  { id: 'mit-news', name: 'MIT News AI', tier: 'news', kind: 'rss', url: 'https://news.mit.edu/rss/topic/artificial-intelligence2' },

  // ── Community ──────────────────────────────────────────────────────────────
  { id: 'hn', name: 'Hacker News', tier: 'community', kind: 'hn',
    url: 'https://hn.algolia.com/api/v1/search_by_date', queries: ['LLM', 'AI agent', 'Claude', 'GPT'], minPoints: 120, star: true },
  { id: 'localllama', name: 'r/LocalLLaMA', tier: 'community', kind: 'rss', url: 'https://www.reddit.com/r/LocalLLaMA/.rss' },
  { id: 'alignment-forum', name: 'Alignment Forum', tier: 'community', kind: 'rss', url: 'https://www.alignmentforum.org/feed.xml' },
];

export function enabledSources() {
  const off = new Set(
    (process.env.NEWS_SOURCES_DISABLED || '')
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
  );
  return SOURCES.filter((s) => !off.has(s.id));
}
