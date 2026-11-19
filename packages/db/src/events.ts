import { ObjectId } from "mongodb";
import { collections } from "./client.js";

/** Anonymous engagement event from a sent email. Never contains an address. */
export interface EmailEventDoc {
  _id: ObjectId;
  /** Only clicks are recorded now; older "unsubscribe" events are ignored. */
  type: "click" | "unsubscribe";
  letterId: ObjectId;
  /** Story clicked (clicks only). */
  storyId?: string;
  /** Keyed hash identifying a reader without revealing their address. */
  recipient: string;
  /** From a test send; excluded from analytics. */
  test: boolean;
  at: Date;
}

export async function recordClick(e: {
  letterId: string;
  storyId: string;
  recipient: string;
  test: boolean;
}): Promise<void> {
  const { events } = await collections();
  await events.insertOne({
    _id: new ObjectId(),
    type: "click",
    letterId: new ObjectId(e.letterId),
    storyId: e.storyId,
    recipient: e.recipient,
    test: e.test,
    at: new Date(),
  });
}

// ── Analytics ────────────────────────────────────────────────────────────────

export interface EngagementTotals {
  clicks: number;
  uniqueClickers: number;
}

export interface SendTotals {
  /** Emails handed to the mail server (subscriber sends only). */
  submitted: number;
  delivered: number;
  failed: number;
  sends: number;
}

export interface LetterAnalyticsRow extends EngagementTotals, SendTotals {
  letterId: ObjectId;
  headline: string;
  date: string;
  status: string;
}

export interface StoryAnalytics {
  letterId: ObjectId;
  letterHeadline: string;
  letterDate: string;
  storyId: string;
  position: number;
  headline: string;
  originalTitle: string;
  sourceName: string;
  url: string;
  clicks: number;
  uniqueClickers: number;
}

const real = { test: false };

function sendTotals(
  sends: { kind: string; recipients: number; delivered: number; failed: number }[] = [],
): SendTotals {
  const s = sends.filter((x) => x.kind === "subscribers");
  return {
    sends: s.length,
    submitted: s.reduce((n, x) => n + x.recipients, 0),
    delivered: s.reduce((n, x) => n + x.delivered, 0),
    failed: s.reduce((n, x) => n + x.failed, 0),
  };
}

async function engagementByLetter(letterIds?: ObjectId[]) {
  const { events } = await collections();
  const rows = await events
    .aggregate<{ _id: ObjectId; clicks: number; clickers: string[] }>([
      {
        $match: {
          ...real,
          type: "click",
          ...(letterIds ? { letterId: { $in: letterIds } } : {}),
        },
      },
      { $group: { _id: "$letterId", clicks: { $sum: 1 }, clickers: { $addToSet: "$recipient" } } },
    ])
    .toArray();
  return new Map(
    rows.map((r) => [r._id.toHexString(), { clicks: r.clicks, uniqueClickers: r.clickers.length }]),
  );
}

/** Every letter that has been sent to subscribers, newest edition first. */
export async function listLetterAnalytics(): Promise<LetterAnalyticsRow[]> {
  const { letters } = await collections();
  const sent = await letters
    .find({ sends: { $elemMatch: { kind: "subscribers" } } })
    .project<{
      _id: ObjectId;
      headline: string;
      date: string;
      status: string;
      sends: LetterAnalyticsRow[];
    }>({
      headline: 1,
      date: 1,
      status: 1,
      sends: 1,
    })
    .sort({ date: -1, _id: -1 })
    .toArray();
  const engagement = await engagementByLetter(sent.map((l) => l._id));
  return sent.map((l) => ({
    letterId: l._id,
    headline: l.headline,
    date: l.date,
    status: l.status,
    ...sendTotals(l.sends as never),
    ...(engagement.get(l._id.toHexString()) ?? { clicks: 0, uniqueClickers: 0 }),
  }));
}

/** Totals across every sent letter. Unique clickers are distinct readers overall. */
export async function analyticsOverview(): Promise<
  SendTotals & EngagementTotals & { letters: number }
> {
  const rows = await listLetterAnalytics();
  const { events } = await collections();
  const [unique] = await events
    .aggregate<{ n: number }>([
      { $match: { ...real, type: "click", letterId: { $in: rows.map((r) => r.letterId) } } },
      { $group: { _id: "$recipient" } },
      { $count: "n" },
    ])
    .toArray();
  const sum = (k: keyof LetterAnalyticsRow) => rows.reduce((n, r) => n + (r[k] as number), 0);
  return {
    letters: rows.length,
    sends: sum("sends"),
    submitted: sum("submitted"),
    delivered: sum("delivered"),
    failed: sum("failed"),
    clicks: sum("clicks"),
    uniqueClickers: unique?.n ?? 0,
  };
}

async function storyClicks(match: Record<string, unknown>) {
  const { events } = await collections();
  return events
    .aggregate<{
      _id: { letterId: ObjectId; storyId: string };
      clicks: number;
      clickers: string[];
    }>([
      { $match: { ...real, type: "click", ...match } },
      {
        $group: {
          _id: { letterId: "$letterId", storyId: "$storyId" },
          clicks: { $sum: 1 },
          clickers: { $addToSet: "$recipient" },
        },
      },
      { $sort: { clicks: -1 } },
    ])
    .toArray();
}

async function attachStories(
  rows: { letterId: ObjectId; storyId: string; clicks: number; uniqueClickers: number }[],
): Promise<StoryAnalytics[]> {
  const { letters } = await collections();
  const ids = [...new Set(rows.map((r) => r.letterId.toHexString()))].map((id) => new ObjectId(id));
  const docs = await letters
    .find({ _id: { $in: ids } }, { projection: { headline: 1, date: 1, stories: 1 } })
    .toArray();
  const byId = new Map(docs.map((d) => [d._id.toHexString(), d]));
  return rows.flatMap((r) => {
    const letter = byId.get(r.letterId.toHexString());
    const position = letter?.stories.findIndex((s) => s.id === r.storyId) ?? -1;
    const story = letter?.stories[position];
    if (!letter || !story) return [];
    return [
      {
        letterId: r.letterId,
        letterHeadline: letter.headline,
        letterDate: letter.date,
        storyId: r.storyId,
        position: position + 1,
        headline: story.headline || story.original.title,
        originalTitle: story.original.title,
        sourceName: story.original.sourceName,
        url: story.original.url,
        clicks: r.clicks,
        uniqueClickers: r.uniqueClickers,
      },
    ];
  });
}

/** Stories with the most clicks across all letters. */
export async function topStories(limit = 10): Promise<StoryAnalytics[]> {
  const rows = (await storyClicks({})).slice(0, limit * 2); // headroom for stories since removed
  const stories = await attachStories(
    rows.map((r) => ({ ...r._id, clicks: r.clicks, uniqueClickers: r.clickers.length })),
  );
  return stories.slice(0, limit);
}

/** One letter: send totals, engagement, and clicks for every story in letter order. */
export async function letterAnalytics(id: string): Promise<{
  row: LetterAnalyticsRow;
  stories: StoryAnalytics[];
} | null> {
  if (!/^[0-9a-f]{24}$/.test(id)) return null;
  const { letters } = await collections();
  const letter = await letters.findOne({ _id: new ObjectId(id) });
  if (!letter) return null;
  const engagement = (await engagementByLetter([letter._id])).get(id) ?? {
    clicks: 0,
    uniqueClickers: 0,
  };
  const clicks = new Map(
    (await storyClicks({ letterId: letter._id })).map((r) => [r._id.storyId, r]),
  );
  return {
    row: {
      letterId: letter._id,
      headline: letter.headline,
      date: letter.date,
      status: letter.status,
      ...sendTotals(letter.sends),
      ...engagement,
    },
    stories: letter.stories.map((s, i) => ({
      letterId: letter._id,
      letterHeadline: letter.headline,
      letterDate: letter.date,
      storyId: s.id,
      position: i + 1,
      headline: s.headline || s.original.title,
      originalTitle: s.original.title,
      sourceName: s.original.sourceName,
      url: s.original.url,
      clicks: clicks.get(s.id)?.clicks ?? 0,
      uniqueClickers: clicks.get(s.id)?.clickers.length ?? 0,
    })),
  };
}

/** The destination for a tracked click: the story's stored URL, never one from the link. */
export async function storyUrl(letterId: string, storyId: string): Promise<string | null> {
  if (!/^[0-9a-f]{24}$/.test(letterId)) return null;
  const { letters } = await collections();
  const doc = await letters.findOne(
    { _id: new ObjectId(letterId), "stories.id": storyId },
    { projection: { "stories.$": 1 } },
  );
  return doc?.stories[0]?.original.url ?? null;
}
