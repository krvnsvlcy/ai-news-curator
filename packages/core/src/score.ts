import type { Article, CuratedArticle } from "./types.js";

const DEFAULT_KEYWORDS = [
  "llm",
  "agent",
  "model",
  "inference",
  "fine-tuning",
  "benchmark",
  "open source",
  "ai",
];

/**
 * Baseline keyword scorer. Swap this for a model-based ranker later;
 * the CuratedArticle shape stays the same.
 */
export function scoreArticle(
  article: Article,
  keywords: readonly string[] = DEFAULT_KEYWORDS,
): CuratedArticle {
  const haystack = `${article.title} ${article.summary ?? ""}`.toLowerCase();
  const tags = keywords.filter((k) => new RegExp(`\\b${escapeRegExp(k)}\\b`).test(haystack));
  const score = keywords.length === 0 ? 0 : Math.min(1, tags.length / 3);
  return { ...article, score, tags };
}

export function curate(articles: Article[], minScore = 0.3): CuratedArticle[] {
  return articles
    .map((a) => scoreArticle(a))
    .filter((a) => a.score >= minScore)
    .sort((a, b) => b.score - a.score || b.publishedAt.localeCompare(a.publishedAt));
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
