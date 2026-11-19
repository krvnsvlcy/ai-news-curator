import { type AnyBulkWriteOperation, ObjectId } from "mongodb";
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

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Case-insensitive search over titles and summaries, newest first. Every word
 * in the query must appear somewhere in the title or summary.
 */
export async function searchArticles({
  query = "",
  sourceSlug,
  limit = 40,
}: {
  query?: string;
  sourceSlug?: string;
  limit?: number;
} = {}): Promise<ArticleDoc[]> {
  const words = query.trim().split(/\s+/).filter(Boolean).slice(0, 8);
  const { articles } = await collections();
  return articles
    .find({
      ...(sourceSlug ? { sourceSlug } : {}),
      ...(words.length
        ? {
            $and: words.map((w) => {
              const re = new RegExp(escapeRegExp(w), "i");
              return { $or: [{ title: re }, { summary: re }] };
            }),
          }
        : {}),
    })
    .sort({ publishedAt: -1, _id: -1 })
    .limit(Math.min(Math.max(limit, 1), 100))
    .toArray();
}

/** Minutes London is ahead of UTC at `at` (0 in winter, 60 in summer). */
function londonOffsetMinutes(at: Date): number {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/London",
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    })
      .formatToParts(at)
      .map((p) => [p.type, p.value]),
  );
  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
  );
  return Math.round((asUtc - at.getTime()) / 60000);
}

/** The instant a London calendar day (YYYY-MM-DD) starts. UK clocks change at 1am, never at midnight. */
export function londonMidnight(day: string): Date {
  const utcMidnight = new Date(`${day}T00:00:00Z`);
  return new Date(utcMidnight.getTime() - londonOffsetMinutes(utcMidnight) * 60000);
}

/** Articles published during a London calendar day, newest first. */
export async function listArticlesForDay(day: string, limit = 150): Promise<ArticleDoc[]> {
  const start = londonMidnight(day);
  const next = new Date(`${day}T00:00:00Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  const end = londonMidnight(next.toISOString().slice(0, 10));
  const { articles } = await collections();
  return articles
    .find({ publishedAt: { $gte: start, $lt: end } })
    .sort({ publishedAt: -1 })
    .limit(limit)
    .toArray();
}

/** Articles by id (hex strings); unknown or malformed ids are skipped. */
export async function getArticlesByIds(ids: string[]): Promise<ArticleDoc[]> {
  const valid = ids.filter((id) => /^[0-9a-f]{24}$/.test(id)).map((id) => new ObjectId(id));
  if (!valid.length) return [];
  const { articles } = await collections();
  return articles.find({ _id: { $in: valid } }).toArray();
}
