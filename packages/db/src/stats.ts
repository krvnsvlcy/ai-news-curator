import type { Collection, Db } from "mongodb";
import { collections } from "./client.js";

// Daily dashboard counters. Every related action increments the counters for
// the day it happens (UTC), so the dashboard reads one document per day with no
// aggregation. Test sends never count.

export interface DailyStatsDoc {
  /** UTC day, YYYY-MM-DD. */
  _id: string;
  /** Total subscribers after the last change that day (absent: no change). */
  subscribers?: number;
  /** Counter version `subscribers` was taken at; a later write never loses to an earlier one. */
  subscribersVersion?: number;
  subscribersAdded?: number;
  subscribersRemoved?: number;
  /** Emails delivered by subscriber sends. */
  delivered?: number;
  /** Open-pixel loads, and first opens per reader per letter. */
  opens?: number;
  uniqueOpens?: number;
  /** Story-link clicks, and first clicks per reader per letter. */
  clicks?: number;
  uniqueClicks?: number;
}

/** Running totals (one document per counter). */
export interface CounterDoc {
  _id: "subscribers";
  value: number;
  /** Bumped on every change, to order concurrent snapshots. */
  version: number;
}

/** Whether a reader has opened / clicked a letter yet; makes "unique" a single atomic write. */
export interface LetterReaderDoc {
  /** `${letterId}:${recipient}` */
  _id: string;
  opened?: boolean;
  clicked?: boolean;
}

type Counter = Exclude<keyof DailyStatsDoc, "_id" | "subscribers" | "subscribersVersion">;

export function dayKey(d = new Date()): string {
  return d.toISOString().slice(0, 10);
}

async function bump(daily: Collection<DailyStatsDoc>, inc: Partial<Record<Counter, number>>) {
  await daily.updateOne({ _id: dayKey() }, { $inc: inc }, { upsert: true });
}

/** Records subscribers created (+) or deleted (−) and snapshots the new total on today. */
export async function recordSubscriberChange(delta: number): Promise<void> {
  if (!delta) return;
  const { counters, daily } = await collections();
  const res = await counters.findOneAndUpdate(
    { _id: "subscribers" },
    { $inc: { value: delta, version: 1 } },
    { upsert: true, returnDocument: "after" },
  );
  const day = dayKey();
  await daily.updateOne(
    { _id: day },
    { $inc: delta > 0 ? { subscribersAdded: delta } : { subscribersRemoved: -delta } },
    { upsert: true },
  );
  // Only a newer change may overwrite the day's snapshot.
  await daily.updateOne(
    {
      _id: day,
      $or: [
        { subscribersVersion: { $exists: false } },
        { subscribersVersion: { $lt: res?.version ?? 0 } },
      ],
    },
    { $set: { subscribers: Math.max(0, res?.value ?? 0), subscribersVersion: res?.version ?? 0 } },
  );
}

/**
 * Seeds the running subscriber total from the collection the first time
 * (idempotent). Runs during startup, so it takes the Db directly: collections()
 * would wait on startup itself.
 */
export async function seedSubscriberCounter(db: Db): Promise<void> {
  const counters = db.collection<CounterDoc>("counters");
  if (await counters.findOne({ _id: "subscribers" })) return;
  const value = await db.collection("subscribers").countDocuments();
  const res = await counters.updateOne(
    { _id: "subscribers" },
    { $setOnInsert: { value, version: 0 } },
    { upsert: true },
  );
  if (res.upsertedCount) {
    const daily = db.collection<DailyStatsDoc>("daily_stats");
    const day = dayKey();
    await daily.updateOne({ _id: day }, { $inc: { subscribersAdded: 0 } }, { upsert: true });
    await daily.updateOne(
      { _id: day, subscribersVersion: { $exists: false } },
      { $set: { subscribers: value, subscribersVersion: 0 } },
    );
  }
}

export async function recordDelivered(count: number): Promise<void> {
  if (count <= 0) return;
  const { daily } = await collections();
  await bump(daily, { delivered: count });
}

/** Flags the reader's first open/click of a letter; true if this is the first. */
async function firstTime(letterId: string, recipient: string, flag: "opened" | "clicked") {
  const { readers } = await collections();
  const res = await readers.updateOne(
    { _id: `${letterId}:${recipient}` },
    { $set: { [flag]: true } },
    { upsert: true },
  );
  return res.upsertedCount === 1 || res.modifiedCount === 1;
}

export async function recordOpenStat(e: {
  letterId: string;
  recipient: string;
  test: boolean;
}): Promise<void> {
  if (e.test) return;
  const unique = await firstTime(e.letterId, e.recipient, "opened");
  const { daily } = await collections();
  await bump(daily, { opens: 1, ...(unique ? { uniqueOpens: 1 } : {}) });
}

export async function recordClickStat(e: {
  letterId: string;
  recipient: string;
  test: boolean;
}): Promise<void> {
  if (e.test) return;
  const unique = await firstTime(e.letterId, e.recipient, "clicked");
  const { daily } = await collections();
  await bump(daily, { clicks: 1, ...(unique ? { uniqueClicks: 1 } : {}) });
}

/**
 * Daily counters for [from, to] (inclusive, YYYY-MM-DD), one entry per day with
 * zeros filled in. `subscribers` carries forward from the last snapshot, including
 * one from before the range; it's null before tracking began (no snapshot yet).
 */
export async function getDailyStats(
  from: string,
  to: string,
): Promise<
  (Required<Omit<DailyStatsDoc, "_id" | "subscribers" | "subscribersVersion">> & {
    day: string;
    subscribers: number | null;
  })[]
> {
  const { daily } = await collections();
  const [docs, before] = await Promise.all([
    daily
      .find({ _id: { $gte: from, $lte: to } })
      .sort({ _id: 1 })
      .toArray(),
    daily.findOne(
      { _id: { $lt: from }, subscribers: { $exists: true } },
      { sort: { _id: -1 }, projection: { subscribers: 1 } },
    ),
  ]);
  const byDay = new Map(docs.map((d) => [d._id, d]));
  const out = [];
  let subscribers: number | null = before?.subscribers ?? null;
  for (let d = new Date(`${from}T00:00:00Z`); dayKey(d) <= to; d.setUTCDate(d.getUTCDate() + 1)) {
    const day = dayKey(d);
    const doc = byDay.get(day);
    if (doc?.subscribers !== undefined) subscribers = doc.subscribers;
    out.push({
      day,
      subscribers,
      subscribersAdded: doc?.subscribersAdded ?? 0,
      subscribersRemoved: doc?.subscribersRemoved ?? 0,
      delivered: doc?.delivered ?? 0,
      opens: doc?.opens ?? 0,
      uniqueOpens: doc?.uniqueOpens ?? 0,
      clicks: doc?.clicks ?? 0,
      uniqueClicks: doc?.uniqueClicks ?? 0,
    });
  }
  return out;
}
