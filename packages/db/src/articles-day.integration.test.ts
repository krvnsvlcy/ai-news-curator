import { afterAll, beforeAll, describe, expect, it } from "vitest";

const url = process.env.MONGO_TEST_URL;

describe.skipIf(!url)("articles by London day (integration)", () => {
  // biome-ignore lint/suspicious/noExplicitAny: module is imported after env is set
  let db: any;
  const ids: string[] = [];

  beforeAll(async () => {
    process.env.MONGO_DB_URL = url;
    process.env.MONGO_DB_NAME = `curator_articles_day_test_${Date.now()}`;
    db = await import("./index.js");
    const source = { _id: new db.ObjectId(), slug: "sky", name: "Sky News" };
    const at = (iso: string, n: string) => ({
      externalId: n,
      url: `https://news.test/${n}`,
      title: `Story ${n}`,
      publishedAt: new Date(iso),
    });
    await db.upsertArticles(source, [
      // Summer (BST, UTC+1): 15 July in London runs 14 Jul 23:00Z to 15 Jul 23:00Z.
      at("2026-07-14T22:59:00Z", "before"),
      at("2026-07-14T23:00:00Z", "start"),
      at("2026-07-15T12:00:00Z", "noon"),
      at("2026-07-15T22:59:00Z", "end"),
      at("2026-07-15T23:00:00Z", "after"),
      // Winter (GMT): 15 January is exactly the UTC day.
      at("2026-01-15T00:00:00Z", "jan"),
    ]);
    const { articles } = await db.collections();
    for (const a of await articles.find().toArray()) ids.push(a._id.toHexString());
  });
  afterAll(async () => {
    await (await db.getDb()).dropDatabase();
    await db.closeDb();
  });

  it("returns exactly the London calendar day, newest first", async () => {
    const july = await db.listArticlesForDay("2026-07-15");
    expect(july.map((a: { externalId: string }) => a.externalId)).toEqual(["end", "noon", "start"]);
    const jan = await db.listArticlesForDay("2026-01-15");
    expect(jan.map((a: { externalId: string }) => a.externalId)).toEqual(["jan"]);
    expect(await db.listArticlesForDay("2026-07-15", 2)).toHaveLength(2);
  });

  it("finds articles by id, skipping unknown and malformed ids", async () => {
    const found = await db.getArticlesByIds([ids[0], "f".repeat(24), "nope", ids[1]]);
    expect(found).toHaveLength(2);
    expect(await db.getArticlesByIds([])).toEqual([]);
  });
});
