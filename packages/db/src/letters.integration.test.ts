import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

// See db.integration.test.ts for how to run these against a disposable MongoDB.
const url = process.env.MONGO_TEST_URL;

describe.skipIf(!url)("letters (integration)", () => {
  // biome-ignore lint/suspicious/noExplicitAny: module is imported after env is set
  let db: any;

  const story = (id: string, headline = `Headline ${id}`) => ({
    id,
    articleId: "65a000000000000000000001",
    headline,
    description: "",
    original: {
      title: `Original ${id}`,
      url: `https://news.test/${id}`,
      sourceName: "Sky News",
      publishedAt: "2026-11-19T09:00:00.000Z",
    },
  });
  const content = (over = {}) => ({
    headline: "The day in one line",
    date: "2026-11-19",
    briefing: "A briefing.",
    tone: "Dry",
    stories: [story("a"), story("b")],
    ...over,
  });

  beforeAll(async () => {
    process.env.MONGO_DB_URL = url;
    process.env.MONGO_DB_NAME = `curator_letters_test_${Date.now()}`;
    db = await import("./index.js");
  });
  beforeEach(async () => {
    const { letters } = await db.collections();
    await letters.deleteMany({});
  });
  afterAll(async () => {
    if (!db) return;
    await (await db.getDb()).dropDatabase();
    await db.closeDb();
  });

  it("creates drafts and saves content with revision checks", async () => {
    const l = await db.createLetter("2026-11-19");
    expect(l.status).toBe("draft");

    const { letter } = await db.saveLetterContent(l._id, 0, content());
    expect(letter.revision).toBe(1);
    expect(letter.stories.map((s: { id: string }) => s.id)).toEqual(["a", "b"]);
    expect(letter.stories[0].articleId.toHexString()).toBe("65a000000000000000000001");
    expect(letter.stories[0].original.publishedAt).toBeInstanceOf(Date);

    // Stale revision is rejected rather than overwriting someone else's save.
    await expect(
      db.saveLetterContent(l._id, 0, content({ headline: "Other" })),
    ).rejects.toBeInstanceOf(db.LetterConflictError);
  });

  it("validates content", async () => {
    const l = await db.createLetter();
    await expect(db.saveLetterContent(l._id, 0, content({ date: "19/11/2026" }))).rejects.toThrow();
    await expect(
      db.saveLetterContent(
        l._id,
        0,
        content({
          stories: [{ ...story("x"), original: { ...story("x").original, url: "javascript:x" } }],
        }),
      ),
    ).rejects.toThrow();
  });

  it("moves through draft → ready → published and locks published letters", async () => {
    const l = await db.createLetter();
    await expect(db.changeLetterStatus(l._id, 0, "ready")).rejects.toBeInstanceOf(
      db.LetterNotReadyError,
    );

    await db.saveLetterContent(l._id, 0, content());
    await expect(
      db.changeLetterStatus(l._id, 1, "published", { publishedHtml: "<p/>" }),
    ).rejects.toBeInstanceOf(db.InvalidTransitionError);
    const ready = await db.changeLetterStatus(l._id, 1, "ready");
    expect(ready.status).toBe("ready");
    expect(ready.readyAt).toBeInstanceOf(Date);

    const published = await db.changeLetterStatus(l._id, 2, "published", {
      publishedHtml: "<html>v1</html>",
    });
    expect(published.status).toBe("published");
    expect(published.publishedHtml).toBe("<html>v1</html>");

    await expect(db.saveLetterContent(l._id, 3, content())).rejects.toBeInstanceOf(
      db.LetterLockedError,
    );
    await expect(db.changeLetterStatus(l._id, 3, "draft")).rejects.toBeInstanceOf(
      db.InvalidTransitionError,
    );
    expect(await db.deleteDraftLetter(l._id)).toBe(false);
  });

  it("demotes a ready letter that an edit leaves incomplete", async () => {
    const l = await db.createLetter();
    await db.saveLetterContent(l._id, 0, content());
    await db.changeLetterStatus(l._id, 1, "ready");
    const res = await db.saveLetterContent(l._id, 2, content({ briefing: "" }));
    expect(res.letter.status).toBe("draft");
    expect(res.demotedBecause).toEqual(["Write the daily briefing."]);
  });

  it("duplicates into an independent draft", async () => {
    const l = await db.createLetter("2026-01-01");
    await db.saveLetterContent(l._id, 0, content());
    await db.changeLetterStatus(l._id, 1, "ready");
    await db.changeLetterStatus(l._id, 2, "published", { publishedHtml: "<p/>" });

    const copy = await db.duplicateLetter(l._id);
    expect(copy.status).toBe("draft");
    expect(copy.duplicatedFrom.equals(l._id)).toBe(true);
    expect(copy.stories.map((s: { id: string }) => s.id)).not.toContain("a");
    expect(copy.stories[0].original.title).toBe("Original a");

    // Editing the copy leaves the original edition untouched.
    await db.saveLetterContent(copy._id, 0, content({ stories: [story("z", "Changed")] }));
    const original = await db.getLetter(l._id);
    expect(original.stories[0].headline).toBe("Headline a");
  });

  it("lists with status filter, sort and story counts; deletes only drafts", async () => {
    const a = await db.createLetter("2026-11-01");
    const b = await db.createLetter("2026-11-03");
    await db.saveLetterContent(b._id, 0, content({ date: "2026-11-03" }));
    await db.changeLetterStatus(b._id, 1, "ready");

    const all = await db.listLetters({ sort: "date-asc" });
    expect(all.map((l: { date: string }) => l.date)).toEqual(["2026-11-01", "2026-11-03"]);
    expect(all[1].storyCount).toBe(2);
    expect(
      (await db.listLetters({ status: "ready" })).map((l: { _id: unknown }) => String(l._id)),
    ).toEqual([String(b._id)]);
    expect(await db.countLettersByStatus()).toEqual({ draft: 1, ready: 1, published: 0 });

    expect(await db.deleteDraftLetter(b._id)).toBe(false);
    expect(await db.deleteDraftLetter(a._id)).toBe(true);
    expect(await db.getLetter(a._id)).toBeNull();
  });
});
