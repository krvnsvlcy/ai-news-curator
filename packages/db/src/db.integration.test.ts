import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

// Runs only when MONGO_TEST_URL points at a disposable MongoDB, e.g.
//   docker run -d --rm -p 27399:27017 mongo:8
//   MONGO_TEST_URL=mongodb://localhost:27399 pnpm --filter @curator/db test
const url = process.env.MONGO_TEST_URL;

describe.skipIf(!url)("db (integration)", () => {
  // biome-ignore lint/suspicious/noExplicitAny: module is imported after env is set
  let db: any;

  beforeAll(async () => {
    process.env.MONGO_DB_URL = url;
    process.env.MONGO_DB_NAME = `curator_test_${Date.now()}`;
    db = await import("./index.js");
  });

  beforeEach(async () => {
    const { sources, articles } = await db.collections();
    await Promise.all([sources.deleteMany({}), articles.deleteMany({})]);
  });

  afterAll(async () => {
    if (!db) return;
    await (await db.getDb()).dropDatabase();
    await db.closeDb();
  });

  it("seeds defaults once and never overwrites edits", async () => {
    expect(await db.seedDefaultSources()).toHaveLength(db.DEFAULT_SOURCES.length);
    const sky = (await db.listSources()).find((s: { slug: string }) => s.slug === "sky-news-uk");
    await db.updateSource(sky._id, { ...sky, name: "Sky (edited)" });
    expect(await db.seedDefaultSources()).toEqual([]);
    expect((await db.getSource(sky._id)).name).toBe("Sky (edited)");
  });

  it("rejects duplicate slugs and invalid input", async () => {
    const input = { name: "A", slug: "a", config: { kind: "feed", url: "https://a.test/rss" } };
    await db.createSource(input);
    await expect(db.createSource(input)).rejects.toBeInstanceOf(db.DuplicateSlugError);
    await expect(
      db.createSource({ ...input, slug: "b", config: { kind: "feed", url: "ftp://x" } }),
    ).rejects.toThrow();
  });

  it("upserts articles without duplicates and counts new ones", async () => {
    const src = await db.createSource({
      name: "Feed",
      slug: "feed",
      config: { kind: "feed", url: "https://a.test/rss" },
    });
    const item = (id: string, title = id) => ({
      externalId: id,
      url: `https://a.test/${id}`,
      title,
      publishedAt: new Date("2026-11-19T10:00:00Z"),
    });

    expect(await db.upsertArticles(src, [item("1"), item("2"), item("2")])).toMatchObject({
      upserted: 2,
    });
    expect(await db.upsertArticles(src, [item("2", "Updated"), item("3")])).toMatchObject({
      upserted: 1,
      matched: 1,
    });

    const list = await db.listArticles({ sourceSlug: "feed" });
    expect(list).toHaveLength(3);
    expect(list.find((a: { externalId: string }) => a.externalId === "2").title).toBe("Updated");
  });

  it("finds due sources based on interval and enabled flag", async () => {
    const now = new Date("2026-11-19T12:00:00Z");
    const mk = (slug: string, enabled = true) =>
      db.createSource({
        name: slug,
        slug,
        enabled,
        fetchIntervalMinutes: 30,
        config: { kind: "feed", url: "https://a.test/rss" },
      });
    const never = await mk("never");
    const recent = await mk("recent");
    const stale = await mk("stale");
    await mk("disabled", false);
    await db.recordFetchResult(
      recent._id,
      { status: "ok", itemCount: 1, newCount: 1 },
      new Date(now.getTime() - 10 * 60_000),
    );
    await db.recordFetchResult(
      stale._id,
      { status: "error", error: "boom" },
      new Date(now.getTime() - 31 * 60_000),
    );

    const due = (await db.listDueSources(now)).map((s: { slug: string }) => s.slug).sort();
    expect(due).toEqual(["never", "stale"]);
    expect((await db.getSource(stale._id)).lastError).toBe("boom");
    expect(never.lastFetchedAt).toBeUndefined();
  });

  it("renaming a source updates its articles; deleting removes them", async () => {
    const src = await db.createSource({
      name: "Old",
      slug: "old",
      config: { kind: "feed", url: "https://a.test/rss" },
    });
    await db.upsertArticles(src, [
      { externalId: "x", url: "https://a.test/x", title: "x", publishedAt: new Date() },
    ]);
    await db.updateSource(src._id, { name: "New", slug: "new", config: src.config });
    expect((await db.listArticles({ sourceSlug: "new" }))[0].sourceName).toBe("New");

    await db.deleteSource(src._id.toHexString());
    expect(await db.listArticles()).toHaveLength(0);
    expect(await db.getSource(src._id)).toBeNull();
  });
});
