import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

const url = process.env.MONGO_TEST_URL;

describe.skipIf(!url)("daily stats (integration)", () => {
  // biome-ignore lint/suspicious/noExplicitAny: module is imported after env is set
  let db: any;
  const owner = "owner_stats_xxxxxxxxxxx";
  const letterId = "a".repeat(24);
  const today = () => new Date().toISOString().slice(0, 10);

  beforeAll(async () => {
    process.env.MONGO_DB_URL = url;
    process.env.MONGO_DB_NAME = `curator_stats_test_${Date.now()}`;
    db = await import("./index.js");
  });
  beforeEach(async () => {
    const c = await db.collections();
    await Promise.all([
      c.subscribers.deleteMany({}),
      c.daily.deleteMany({}),
      c.readers.deleteMany({}),
      c.counters.updateOne({ _id: "subscribers" }, { $set: { value: 0, version: 0 } }),
    ]);
  });
  afterAll(async () => {
    await (await db.getDb()).dropDatabase();
    await db.closeDb();
  });

  const todayDoc = async () => (await db.collections()).daily.findOne({ _id: today() });

  it("tracks the subscriber total as addresses are created and deleted", async () => {
    await db.addSubscriber({ email: "a@example.com", ownerId: owner });
    await db.addSubscriber({ email: "b@example.com", ownerId: owner });
    await db.addSubscriber({ email: "c@example.com", ownerId: owner });
    await db.addSubscriber({ email: "a@example.com", ownerId: "other_owner_xxxxxxxxxx" }); // link: no change
    let doc = await todayDoc();
    expect(doc).toMatchObject({ subscribers: 3, subscribersAdded: 3 });

    const [row] = await db.listOwnSubscribers(owner);
    await db.removeOwnSubscriber(owner, row._id.toHexString());
    expect(await db.clearOwnSubscribers(owner)).toBe(2);
    // "a" is still on the other list, so only 2 rows were deleted in total.
    doc = await todayDoc();
    expect(doc.subscribers).toBe(await db.countSubscribers());
    expect(doc.subscribersRemoved).toBe(3 - (await db.countSubscribers()));
  });

  it("keeps the latest snapshot under concurrent changes", async () => {
    await Promise.all(
      Array.from({ length: 20 }, (_, i) =>
        db.addSubscriber({ email: `p${i}@example.com`, ownerId: owner }),
      ),
    );
    expect((await todayDoc()).subscribers).toBe(20);
  });

  it("counts delivered, opens and clicks, unique once per reader per letter", async () => {
    await db.recordDelivered(10);
    await db.recordDelivered(0);
    const open = (recipient: string, test = false) =>
      db.recordOpenStat({ letterId, recipient, test });
    const click = (recipient: string, test = false) =>
      db.recordClickStat({ letterId, recipient, test });
    await open("r1");
    await open("r1");
    await open("r2");
    await open("tester", true);
    await click("r1");
    await click("r1");
    await click("tester", true);
    // The same reader on another letter is unique again.
    await db.recordOpenStat({ letterId: "b".repeat(24), recipient: "r1", test: false });
    expect(await todayDoc()).toMatchObject({
      delivered: 10,
      opens: 4,
      uniqueOpens: 3,
      clicks: 2,
      uniqueClicks: 1,
    });
  });

  it("counts a first open once under concurrent loads", async () => {
    await Promise.all(
      Array.from({ length: 10 }, () =>
        db.recordOpenStat({ letterId, recipient: "r9", test: false }),
      ),
    );
    expect(await todayDoc()).toMatchObject({ opens: 10, uniqueOpens: 1 });
  });

  it("returns one row per day with zeros, carrying the subscriber total forward", async () => {
    const { daily } = await db.collections();
    await daily.insertMany([
      { _id: "2026-01-01", subscribers: 5 },
      { _id: "2026-01-03", delivered: 4, uniqueOpens: 2 },
      { _id: "2026-01-04", subscribers: 7, subscribersAdded: 2 },
    ]);
    expect(
      (await db.getDailyStats("2025-12-30", "2026-01-01")).map(
        (r: { subscribers: number | null }) => r.subscribers,
      ),
    ).toEqual([null, null, 5]); // unknown before the first snapshot
    const rows = await db.getDailyStats("2026-01-02", "2026-01-05");
    expect(rows.map((r: { day: string }) => r.day)).toEqual([
      "2026-01-02",
      "2026-01-03",
      "2026-01-04",
      "2026-01-05",
    ]);
    expect(rows.map((r: { subscribers: number }) => r.subscribers)).toEqual([5, 5, 7, 7]);
    expect(rows[1]).toMatchObject({ delivered: 4, uniqueOpens: 2, clicks: 0 });
    expect(rows[0]).toMatchObject({ delivered: 0, opens: 0 });
  });

  it("seeds the running total from existing subscribers once", async () => {
    const d = await db.getDb();
    await d.collection("counters").deleteMany({});
    await d.collection("subscribers").insertMany([
      { email: "x@example.com", ownerIds: [owner], subscribedAt: new Date() },
      { email: "y@example.com", ownerIds: [owner], subscribedAt: new Date() },
    ]);
    await db.seedSubscriberCounter(d);
    await db.seedSubscriberCounter(d); // idempotent
    expect(await d.collection("counters").findOne({ _id: "subscribers" })).toMatchObject({
      value: 2,
    });
    expect((await todayDoc()).subscribers).toBe(2);
    await db.addSubscriber({ email: "z@example.com", ownerId: owner });
    expect((await todayDoc()).subscribers).toBe(3);
  });
});
