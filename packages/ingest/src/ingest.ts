import {
  type ArticleInput,
  listDueSources,
  recordFetchResult,
  type SourceConfig,
  type SourceDoc,
  upsertArticles,
} from "@curator/db";
import { fetchFeed } from "./adapters/feed.js";
import { fetchGuardian } from "./adapters/guardian.js";

export function fetchSourceItems(config: SourceConfig): Promise<ArticleInput[]> {
  switch (config.kind) {
    case "feed":
      return fetchFeed(config.url);
    case "guardian":
      return fetchGuardian(config);
  }
}

export type IngestResult =
  | { source: string; status: "ok"; itemCount: number; newCount: number }
  | { source: string; status: "error"; error: string };

/** Fetches one source, stores its articles and records the outcome on the source. */
export async function ingestSource(source: SourceDoc): Promise<IngestResult> {
  try {
    const items = await fetchSourceItems(source.config);
    const { upserted } = await upsertArticles(source, items);
    await recordFetchResult(source._id, {
      status: "ok",
      itemCount: items.length,
      newCount: upserted,
    });
    return { source: source.slug, status: "ok", itemCount: items.length, newCount: upserted };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    await recordFetchResult(source._id, { status: "error", error });
    return { source: source.slug, status: "error", error };
  }
}

/** Ingests every enabled source whose interval has elapsed, one at a time. */
export async function ingestDueSources(now = new Date()): Promise<IngestResult[]> {
  const results: IngestResult[] = [];
  for (const source of await listDueSources(now)) {
    results.push(await ingestSource(source));
  }
  return results;
}
