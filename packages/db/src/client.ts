import { type Collection, type Db, MongoClient } from "mongodb";
import { getMongoConfig } from "./config.js";
import type { EmailEventDoc } from "./events.js";
import type { LetterDoc } from "./letter-schema.js";
import type { PromptDoc } from "./prompts.js";
import type { ArticleDoc, SourceDoc } from "./schema.js";
import {
  type CounterDoc,
  type DailyStatsDoc,
  type LetterReaderDoc,
  seedSubscriberCounter,
} from "./stats.js";
import type { SubscriberDoc } from "./subscribers.js";

interface Cached {
  client: Promise<MongoClient>;
  dbName: string;
  indexes?: Promise<void>;
}

// Cached on globalThis so Next.js dev hot-reloads reuse one connection pool.
const g = globalThis as typeof globalThis & { __curatorMongo?: Cached };

function cached(): Cached {
  if (!g.__curatorMongo) {
    const { uri, dbName } = getMongoConfig();
    const client = new MongoClient(uri, { appName: "ai-news-curator" }).connect();
    // Don't cache a failed connection; the next call retries.
    client.catch(() => {
      g.__curatorMongo = undefined;
    });
    g.__curatorMongo = { client, dbName };
  }
  return g.__curatorMongo;
}

export async function getDb(): Promise<Db> {
  const c = cached();
  const db = (await c.client).db(c.dbName);
  c.indexes ??= ensureIndexes(db).catch((err) => {
    c.indexes = undefined;
    throw err;
  });
  await c.indexes;
  return db;
}

export async function collections(): Promise<{
  sources: Collection<SourceDoc>;
  articles: Collection<ArticleDoc>;
  letters: Collection<LetterDoc>;
  events: Collection<EmailEventDoc>;
  subscribers: Collection<SubscriberDoc>;
  daily: Collection<DailyStatsDoc>;
  counters: Collection<CounterDoc>;
  readers: Collection<LetterReaderDoc>;
  prompts: Collection<PromptDoc>;
}> {
  const db = await getDb();
  return {
    sources: db.collection<SourceDoc>("sources"),
    articles: db.collection<ArticleDoc>("articles"),
    letters: db.collection<LetterDoc>("letters"),
    events: db.collection<EmailEventDoc>("email_events"),
    subscribers: db.collection<SubscriberDoc>("subscribers"),
    daily: db.collection<DailyStatsDoc>("daily_stats"),
    counters: db.collection<CounterDoc>("counters"),
    readers: db.collection<LetterReaderDoc>("letter_readers"),
    prompts: db.collection<PromptDoc>("prompts"),
  };
}

export async function closeDb(): Promise<void> {
  const c = g.__curatorMongo;
  g.__curatorMongo = undefined;
  if (c) await (await c.client).close();
}

async function ensureIndexes(db: Db): Promise<void> {
  await migrateSubscribers(db);
  await seedSubscriberCounter(db);
  await Promise.all([
    db.collection("sources").createIndex({ slug: 1 }, { unique: true }),
    db
      .collection("articles")
      .createIndex({ sourceId: 1, externalId: 1 }, { unique: true, name: "source_external_id" }),
    db.collection("articles").createIndex({ publishedAt: -1 }),
    db.collection("articles").createIndex({ sourceSlug: 1, publishedAt: -1 }),
    db.collection("letters").createIndex({ date: -1, _id: -1 }),
    db.collection("letters").createIndex({ status: 1, date: -1 }),
    // Lets us answer "which letters used this article?" without a scan.
    db.collection("letters").createIndex({ "stories.articleId": 1 }),
    db.collection("email_events").createIndex({ letterId: 1, type: 1, test: 1 }),
    db.collection("email_events").createIndex({ type: 1, test: 1, at: -1 }),
    // Dedupe: one row per address, stored lowercased.
    db.collection("subscribers").createIndex({ email: 1 }, { unique: true }),
    db.collection("subscribers").createIndex({ ownerIds: 1, subscribedAt: -1 }),
  ]);
}

/**
 * Brings older subscriber rows up to date (idempotent, cheap when none left):
 * - rows a reader unsubscribed are deleted (there's no opting out any more;
 *   editors can re-add an address);
 * - the single `ownerId` becomes the `ownerIds` list;
 * - fields of removed features (status, signup source, name) are dropped.
 */
export async function migrateSubscribers(db: Db): Promise<void> {
  const subscribers = db.collection("subscribers");
  await subscribers.deleteMany({ status: "unsubscribed" });
  await subscribers.updateMany({ ownerIds: { $exists: false } }, [
    {
      $set: {
        ownerIds: {
          $cond: [{ $eq: [{ $type: "$ownerId" }, "string"] }, ["$ownerId"], []],
        },
      },
    },
    { $unset: "ownerId" },
  ]);
  await subscribers.updateMany(
    {
      $or: [
        { status: { $exists: true } },
        { source: { $exists: true } },
        { name: { $exists: true } },
      ],
    },
    { $unset: { status: "", source: "", unsubscribedAt: "", name: "" } },
  );
  // A row nobody references can't be seen or removed by anyone.
  await subscribers.deleteMany({ ownerIds: { $size: 0 } });
}
