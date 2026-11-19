import { type Collection, type Db, MongoClient } from "mongodb";
import { getMongoConfig } from "./config.js";
import type { EmailEventDoc } from "./events.js";
import type { LetterDoc } from "./letter-schema.js";
import type { ArticleDoc, SourceDoc } from "./schema.js";

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
}> {
  const db = await getDb();
  return {
    sources: db.collection<SourceDoc>("sources"),
    articles: db.collection<ArticleDoc>("articles"),
    letters: db.collection<LetterDoc>("letters"),
    events: db.collection<EmailEventDoc>("email_events"),
  };
}

export async function closeDb(): Promise<void> {
  const c = g.__curatorMongo;
  g.__curatorMongo = undefined;
  if (c) await (await c.client).close();
}

async function ensureIndexes(db: Db): Promise<void> {
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
    // One unsubscribe per reader per letter.
    db.collection("email_events").createIndex(
      { letterId: 1, recipient: 1 },
      {
        unique: true,
        partialFilterExpression: { type: "unsubscribe" },
        name: "unsubscribe_once",
      },
    ),
  ]);
}
