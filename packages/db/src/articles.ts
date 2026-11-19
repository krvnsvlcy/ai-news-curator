import type { AnyBulkWriteOperation } from "mongodb";
import { collections } from "./client.js";
import type { ArticleDoc, ArticleInput, SourceDoc } from "./schema.js";

/**
 * Inserts new articles and refreshes existing ones (matched on source + externalId).
 * Returns how many were new.
 */
export async function upsertArticles(
  source: Pick<SourceDoc, "_id" | "slug" | "name">,
  items: ArticleInput[],
  now = new Date(),
): Promise<{ upserted: number; matched: number }> {
  if (items.length === 0) return { upserted: 0, matched: 0 };

  // A feed can repeat an item; keep the last occurrence so bulk upserts don't collide.
  const unique = [...new Map(items.map((i) => [i.externalId, i])).values()];

  const ops: AnyBulkWriteOperation<ArticleDoc>[] = unique.map((item) => ({
    updateOne: {
      filter: { sourceId: source._id, externalId: item.externalId },
      update: {
        $set: {
          ...item,
          sourceSlug: source.slug,
          sourceName: source.name,
          lastSeenAt: now,
        },
        $setOnInsert: { firstSeenAt: now },
      },
      upsert: true,
    },
  }));

  const { articles } = await collections();
  const res = await articles.bulkWrite(ops, { ordered: false });
  return { upserted: res.upsertedCount, matched: res.matchedCount };
}

export interface ListArticlesOptions {
  sourceSlug?: string;
  limit?: number;
  /** Return articles published strictly before this date (cursor pagination). */
  before?: Date;
}

export async function listArticles({
  sourceSlug,
  limit = 50,
  before,
}: ListArticlesOptions = {}): Promise<ArticleDoc[]> {
  const { articles } = await collections();
  return articles
    .find({
      ...(sourceSlug ? { sourceSlug } : {}),
      ...(before ? { publishedAt: { $lt: before } } : {}),
    })
    .sort({ publishedAt: -1, _id: -1 })
    .limit(Math.min(Math.max(limit, 1), 200))
    .toArray();
}

export async function countArticlesBySource(): Promise<Map<string, number>> {
  const { articles } = await collections();
  const rows = await articles
    .aggregate<{ _id: unknown; count: number }>([
      { $group: { _id: "$sourceId", count: { $sum: 1 } } },
    ])
    .toArray();
  return new Map(rows.map((r) => [String(r._id), r.count]));
}
