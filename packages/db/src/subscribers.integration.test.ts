import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

const url = process.env.MONGO_TEST_URL;

describe.skipIf(!url)("subscribers (integration)", () => {
  // biome-ignore lint/suspicious/noExplicitAny: module is imported after env is set
  let db: any;
  const alice = "owner_alice_xxxxxxxxxxx";
  const bob = "owner_bob_xxxxxxxxxxxxx";

  beforeAll(async () => {
    process.env.MONGO_DB_URL = url;
    process.env.MONGO_DB_NAME = `curator_subscribers_test_${Date.now()}`;
    db = await import("./index.js");
  });
  beforeEach(async () => {
    const { subscribers } = await db.collections();
    await subscribers.deleteMany({});
  });
  afterAll(async () => {
    await (await db.getDb()).dropDatabase();
    await db.closeDb();
  });

  const add = (email: string, ownerId: string) => db.addSubscriber({ email, ownerId });
  const emails = async (ownerId: string) =>
    (await db.listOwnSubscribers(ownerId)).map((s: { email: string }) => s.email).sort();
  const rowCount = async () => (await db.collections()).subscribers.countDocuments();

  it("dedupes by lowercased, trimmed email", async () => {
    expect(await add("  Reader@Example.COM ", alice)).toBe("added");
    expect(await add("reader@example.com", alice)).toBe("exists");
    expect(await emails(alice)).toEqual(["reader@example.com"]);
    expect(await rowCount()).toBe(1);
  });

  it("keeps details private to referencing owners but counts everyone", async () => {
    await add("a1@example.com", alice);
    await add("a2@example.com", alice);
    await add("b1@example.com", bob);
    expect(await emails(alice)).toEqual(["a1@example.com", "a2@example.com"]);
    expect(await emails(bob)).toEqual(["b1@example.com"]);
    expect(await db.countSubscribers()).toBe(3);
    expect(await db.countOwnSubscribers(alice)).toBe(2);
  });

  it("links an existing address to a second list instead of duplicating it", async () => {
    await add("shared@example.com", alice);
    expect(await add("SHARED@example.com", bob)).toBe("linked");
    expect(await add("shared@example.com", bob)).toBe("exists");
    expect(await rowCount()).toBe(1);
    expect(await emails(bob)).toEqual(["shared@example.com"]);
    expect(await db.countSubscribers()).toBe(1);
  });

  it("only lets an owner remove their own reference", async () => {
    await add("mine@example.com", alice);
    const [row] = await db.listOwnSubscribers(alice);
    const id = row._id.toHexString();
    expect(await db.removeOwnSubscriber(bob, id)).toBe(false);
    expect(await db.clearOwnSubscribers(bob)).toBe(0);
    expect(await emails(alice)).toEqual(["mine@example.com"]);
  });

  it("removing drops only your reference; the row goes with the last one", async () => {
    await add("shared@example.com", alice);
    await add("shared@example.com", bob);
    const [row] = await db.listOwnSubscribers(alice);
    const id = row._id.toHexString();
    expect(await db.removeOwnSubscriber(alice, id)).toBe(true);
    expect(await emails(alice)).toEqual([]);
    expect(await emails(bob)).toEqual(["shared@example.com"]);
    expect(await db.removeOwnSubscriber(bob, id)).toBe(true);
    expect(await rowCount()).toBe(0);
  });

  it("clearing your list keeps addresses other lists reference", async () => {
    await add("shared@example.com", alice);
    await add("solo@example.com", alice);
    await add("shared@example.com", bob);
    expect(await db.clearOwnSubscribers(alice)).toBe(2);
    expect(await emails(alice)).toEqual([]);
    expect(await emails(bob)).toEqual(["shared@example.com"]);
    expect(await rowCount()).toBe(1);
  });

  it("sends to every address on the owner's list, and only theirs", async () => {
    await add("one@example.com", alice);
    await add("two@example.com", alice);
    await add("other@example.com", bob);
    expect((await db.listOwnEmails(alice, 10)).sort()).toEqual([
      "one@example.com",
      "two@example.com",
    ]);
  });

  it("imports a legacy list, linking addresses that already exist", async () => {
    await add("existing@example.com", bob);
    const at = new Date("2026-01-01T00:00:00Z");
    const res = await db.importSubscribers(alice, [
      { email: "New@example.com", subscribedAt: at },
      { email: "new@example.com", subscribedAt: at },
      { email: "existing@example.com", subscribedAt: at },
    ]);
    expect(res).toEqual({ imported: 1, linked: 1 });
    expect(await emails(alice)).toEqual(["existing@example.com", "new@example.com"]);
  });

  it("migrates older rows: owners to a list, opted-out rows deleted, old fields dropped", async () => {
    const { subscribers } = await db.collections();
    const now = new Date();
    const base = { subscribedAt: now, createdAt: now, updatedAt: now };
    await subscribers.insertMany([
      {
        ...base,
        email: "single@example.com",
        ownerId: alice,
        name: "Sam",
        status: "active",
        source: "signup",
      },
      { ...base, email: "list@example.com", ownerIds: [alice, bob], status: "active" },
      {
        ...base,
        email: "optedout@example.com",
        ownerIds: [alice],
        status: "unsubscribed",
        unsubscribedAt: now,
      },
      { ...base, email: "orphan@example.com", ownerIds: [] },
    ]);
    // Adding before migrating must not crash on the old shape.
    expect(await add("single@example.com", bob)).toBe("linked");
    await subscribers.updateOne({ email: "single@example.com" }, { $unset: { ownerIds: "" } });

    await db.migrateSubscribers(await db.getDb());
    expect(await emails(alice)).toEqual(["list@example.com", "single@example.com"]);
    expect(await emails(bob)).toEqual(["list@example.com"]);
    expect(await rowCount()).toBe(2);
    const single = await subscribers.findOne({ email: "single@example.com" });
    expect(single.ownerIds).toEqual([alice]);
    for (const field of ["ownerId", "status", "source", "unsubscribedAt", "name"]) {
      expect(single[field]).toBeUndefined();
    }
    await db.migrateSubscribers(await db.getDb()); // idempotent
    expect(await rowCount()).toBe(2);
  });

  it("handles concurrent adds of the same address from two lists", async () => {
    const results = await Promise.all([
      add("race@example.com", alice),
      add("race@example.com", bob),
    ]);
    expect(results.sort()).toEqual(["added", "linked"]);
    expect(await rowCount()).toBe(1);
    expect(await emails(alice)).toEqual(["race@example.com"]);
    expect(await emails(bob)).toEqual(["race@example.com"]);
  });
});
