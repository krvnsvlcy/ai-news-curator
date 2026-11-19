import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

const url = process.env.MONGO_TEST_URL;

describe.skipIf(!url)("email events & analytics (integration)", () => {
  // biome-ignore lint/suspicious/noExplicitAny: module is imported after env is set
  let db: any;
  let letterId: string;

  const story = (id: string) => ({
    id,
    articleId: null,
    headline: `Headline ${id}`,
    description: "",
    original: { title: `Original ${id}`, url: `https://news.test/${id}`, sourceName: "Sky News" },
  });

  beforeAll(async () => {
    process.env.MONGO_DB_URL = url;
    process.env.MONGO_DB_NAME = `curator_events_test_${Date.now()}`;
    db = await import("./index.js");
  });
  beforeEach(async () => {
    const { letters, events } = await db.collections();
    await Promise.all([letters.deleteMany({}), events.deleteMany({})]);
    const l = await db.createLetter("2026-11-19");
    await db.saveLetterContent(l._id, 0, {
      headline: "Edition",
      date: "2026-11-19",
      briefing: "B",
      tone: "",
      stories: [story("a"), story("b"), story("c")],
    });
    letterId = l._id.toHexString();
    const at = new Date();
    await db.recordLetterSend(l._id, { at, kind: "test", recipients: 1, delivered: 1, failed: 0 });
    await db.recordLetterSend(l._id, {
      at,
      kind: "subscribers",
      recipients: 5,
      delivered: 4,
      failed: 1,
    });
  });
  afterAll(async () => {
    if (!db) return;
    await (await db.getDb()).dropDatabase();
    await db.closeDb();
  });

  it("aggregates sends, clicks and unique clickers, excluding tests", async () => {
    const click = (storyId: string, recipient: string, test = false) =>
      db.recordClick({ letterId, storyId, recipient, test });
    await click("a", "r1");
    await click("a", "r1"); // same reader twice
    await click("a", "r2");
    await click("b", "r1");
    await click("c", "tester", true); // test send: ignored
    // Unsubscribe events from before the feature was removed are ignored.
    const { events } = await db.collections();
    await events.insertOne({
      type: "unsubscribe",
      letterId: new db.ObjectId(letterId),
      recipient: "r3",
      test: false,
      at: new Date(),
    });

    const [row] = await db.listLetterAnalytics();
    expect(row).toMatchObject({
      headline: "Edition",
      sends: 1,
      submitted: 5,
      delivered: 4,
      failed: 1,
      clicks: 4,
      uniqueClickers: 2,
    });

    const detail = await db.letterAnalytics(letterId);
    expect(
      detail.stories.map((s: { storyId: string; clicks: number; uniqueClickers: number }) => [
        s.storyId,
        s.clicks,
        s.uniqueClickers,
      ]),
    ).toEqual([
      ["a", 3, 2],
      ["b", 1, 1],
      ["c", 0, 0],
    ]);

    const top = await db.topStories(5);
    expect(top.map((s: { storyId: string }) => s.storyId)).toEqual(["a", "b"]);
    expect(top[0]).toMatchObject({ position: 1, headline: "Headline a", sourceName: "Sky News" });

    const overview = await db.analyticsOverview();
    expect(overview).toMatchObject({
      letters: 1,
      submitted: 5,
      clicks: 4,
      uniqueClickers: 2,
    });
  });

  it("resolves click destinations from the stored letter only", async () => {
    expect(await db.storyUrl(letterId, "b")).toBe("https://news.test/b");
    expect(await db.storyUrl(letterId, "missing")).toBeNull();
    expect(await db.storyUrl("not-an-id", "b")).toBeNull();
  });

  it("leaves letters without subscriber sends out of analytics", async () => {
    await db.createLetter("2026-11-20");
    expect(await db.listLetterAnalytics()).toHaveLength(1);
  });
});
