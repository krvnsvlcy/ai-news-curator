/**
 * Fills the database with ~90 days of believable history so the dashboard,
 * letters and analytics have something to show:
 *
 * - subscribers growing over time (example.com addresses owned by a separate
 *   demo owner: they count in totals but aren't on anyone's list, so a real
 *   publish never emails them);
 * - a published letter most weekdays for the last 8 weeks, built from stored
 *   articles, each with a send record and story clicks;
 * - daily dashboard counters (delivered, opens, clicks, subscriber totals).
 *
 * Everything is tagged `demo: true`, and what it added to shared counters is
 * recorded, so `--clear` removes it exactly, leaving real data untouched.
 *
 *   pnpm seed:demo           add demo history (refuses if already added)
 *   pnpm seed:demo --clear   remove it
 *   pnpm seed:demo --reset   remove, then add again
 */
import { createHash } from "node:crypto";
import { closeDb, collections, dayKey, getDb, ObjectId } from "@curator/db";
import { renderLetterHtml } from "@curator/newsletter";
import { toNewsletterLetter } from "../lib/letters";
import { newsletterOptions } from "../lib/newsletter-config";

const DAYS = 90;
const LETTER_WEEKS = 8;
const DEMO_OWNER = "demo-seed";
const MANIFEST_ID = "manifest";

type Counter =
  | "subscribersAdded"
  | "subscribersRemoved"
  | "delivered"
  | "opens"
  | "uniqueOpens"
  | "clicks"
  | "uniqueClicks";

interface DayEntry {
  day: string;
  inc: Partial<Record<Counter, number>>;
  /** The day's document before seeding (null: there wasn't one). */
  prev: { subscribers?: number; subscribersVersion?: number } | null;
  /** Snapshot written by the seed, if any. */
  snapshot?: number;
}

interface Manifest {
  _id: string;
  createdAt: Date;
  counterDelta: number;
  days: DayEntry[];
}

// ── Deterministic randomness ────────────────────────────────────────────────

let seed = 0x5eed;
function rand(): number {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = seed;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const between = (a: number, b: number) => a + rand() * (b - a);
const int = (a: number, b: number) => Math.floor(between(a, b + 1));
/** Hours after a send, front-loaded like real email engagement (capped at 4 days). */
const engagementDelay = () => Math.min(96, -Math.log(1 - rand()) * 7) * 3_600_000;

function addDays(day: string, n: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return dayKey(d);
}
const at = (day: string, hours: number) =>
  new Date(Date.parse(`${day}T00:00:00Z`) + hours * 3_600_000);
const recipientId = (n: number) =>
  createHash("sha256").update(`demo-reader-${n}`).digest("hex").slice(0, 32);

function firstSentence(s: string): string {
  const m = s
    .replace(/\s+/g, " ")
    .trim()
    .match(/^.*?[.!?](\s|$)/);
  return (m ? m[0] : s).trim();
}

// ── Seed ────────────────────────────────────────────────────────────────────

async function seedDemo() {
  const db = await getDb();
  const c = await collections();
  const demo = db.collection<Manifest>("demo_seed");
  if (await demo.findOne({ _id: MANIFEST_ID })) {
    throw new Error("Demo history is already in this database. Use --reset to rebuild it.");
  }

  const articles = await c.articles.find().sort({ publishedAt: -1 }).limit(400).toArray();
  if (articles.length < 12) {
    throw new Error(
      `Only ${articles.length} stored articles; refresh the feed first so letters have stories.`,
    );
  }

  const now = new Date();
  const today = dayKey(now);
  const start = addDays(today, -(DAYS - 1));
  const counter = await c.counters.findOne({ _id: "subscribers" });
  const realTotal = counter?.value ?? (await c.subscribers.countDocuments());

  const inc = new Map<string, Partial<Record<Counter, number>>>();
  const bump = (day: string, k: Counter, n: number) => {
    if (n <= 0 || day > today) return;
    const e = inc.get(day) ?? {};
    e[k] = (e[k] ?? 0) + n;
    inc.set(day, e);
  };

  // Subscribers: slow start, steady growth, a few launch-style spikes.
  const spikes = new Set([addDays(start, 18), addDays(start, 47), addDays(start, 71)]);
  const totals = new Map<string, number>();
  const subscriberDocs = [];
  let demoTotal = 0;
  let n = 0;
  for (let i = 0; i < DAYS; i++) {
    const day = addDays(start, i);
    const t = i / DAYS;
    let added = Math.max(0, Math.round(1 + 4.5 * t + between(-1.5, 2)));
    if (spikes.has(day)) added += int(18, 30);
    const removed = rand() < 0.3 ? int(1, 2) : 0;
    bump(day, "subscribersAdded", added);
    bump(day, "subscribersRemoved", removed);
    for (let k = 0; k < added - removed; k++) {
      const when = at(day, between(7, 22));
      subscriberDocs.push({
        _id: new ObjectId(),
        email: `reader${++n}@example.com`,
        ownerIds: [DEMO_OWNER],
        subscribedAt: when,
        createdAt: when,
        updatedAt: when,
        demo: true,
      });
    }
    demoTotal += Math.max(0, added - removed);
    totals.set(day, realTotal + demoTotal);
  }

  // Letters: most weekdays in the last LETTER_WEEKS weeks (not today, not where one exists).
  const taken = new Set(
    (await c.letters.find({}, { projection: { date: 1 } }).toArray()).map((l) => l.date),
  );
  const options = newsletterOptions();
  const letters = [];
  const events = [];
  let cursor = 0;
  for (let i = LETTER_WEEKS * 7; i >= 1; i--) {
    const day = addDays(today, -i);
    const weekday = new Date(`${day}T00:00:00Z`).getUTCDay();
    if (weekday === 0 || weekday === 6 || taken.has(day) || rand() < 0.08) continue;

    const count = int(4, 5);
    const picked = Array.from({ length: count }, () => articles[cursor++ % articles.length]).filter(
      (a): a is (typeof articles)[number] => a !== undefined,
    );
    const lead = picked[0];
    if (!lead) continue;
    const stories = picked.map((a) => ({
      id: crypto.randomUUID(),
      articleId: a._id,
      headline: "",
      description: a.summary ? firstSentence(a.summary).slice(0, 280) : "",
      original: {
        title: a.title,
        url: a.url,
        sourceName: a.sourceName,
        publishedAt: a.publishedAt,
        ...(a.summary ? { summary: a.summary.slice(0, 2000) } : {}),
      },
    }));
    const briefing = picked
      .slice(0, 3)
      .map((a) => (a.summary ? firstSentence(a.summary) : a.title))
      .join(" ")
      .slice(0, 900);
    const content = {
      headline: lead.title.slice(0, 200),
      date: day,
      briefing,
      tone: "",
      stories,
    };

    const publishedAt = at(day, between(6.5, 7.5));
    const recipients = totals.get(day) ?? realTotal;
    const failed = rand() < 0.4 ? int(1, 3) : 0;
    const delivered = Math.max(0, recipients - failed);
    const letterId = new ObjectId();
    letters.push({
      _id: letterId,
      status: "published" as const,
      ...content,
      revision: int(3, 9),
      createdAt: at(addDays(day, -1), between(14, 18)),
      updatedAt: publishedAt,
      readyAt: at(day, 6),
      publishedAt,
      publishedHtml: renderLetterHtml(toNewsletterLetter(content), options),
      sends: [{ at: publishedAt, kind: "subscribers" as const, recipients, delivered, failed }],
      demo: true,
    });
    bump(day, "delivered", delivered);

    // Opens: counted per day (only the dashboard keeps them).
    const openers = Math.round(delivered * between(0.42, 0.62));
    for (let r = 0; r < openers; r++) {
      const first = new Date(publishedAt.getTime() + engagementDelay());
      if (first > now) continue;
      bump(dayKey(first), "uniqueOpens", 1);
      bump(dayKey(first), "opens", 1);
      for (let k = rand() < 0.35 ? int(1, 3) : 0; k > 0; k--) {
        const again = new Date(first.getTime() + engagementDelay());
        if (again <= now) bump(dayKey(again), "opens", 1);
      }
    }

    // Clicks: a share of openers, leaning towards the lead story.
    const weights = stories.map((_, p) => (1 / (p + 1)) ** 0.7 * between(0.6, 1.4));
    const sum = weights.reduce((a, b) => a + b, 0);
    const pickStory = () => {
      let x = rand() * sum;
      for (const [p, story] of stories.entries()) {
        x -= weights[p] ?? 0;
        if (x <= 0) return story;
      }
      return stories[0];
    };
    const clickers = Math.round(openers * between(0.18, 0.32));
    for (let r = 0; r < clickers; r++) {
      const recipient = recipientId(int(1, Math.max(1, demoTotal + realTotal)));
      let when = new Date(publishedAt.getTime() + engagementDelay());
      if (when > now) continue;
      bump(dayKey(when), "uniqueClicks", 1);
      for (let k = rand() < 0.3 ? int(2, 3) : 1; k > 0; k--) {
        if (when > now) break;
        events.push({
          _id: new ObjectId(),
          type: "click" as const,
          letterId,
          storyId: pickStory()?.id ?? "",
          recipient,
          test: false,
          at: when,
          demo: true,
        });
        bump(dayKey(when), "clicks", 1);
        when = new Date(when.getTime() + between(1, 40) * 60_000);
      }
    }
  }

  // Record what's about to change, then write.
  const days = [...new Set([...inc.keys(), ...totals.keys()])].sort();
  const existing = new Map(
    (await c.daily.find({ _id: { $in: days } }).toArray()).map((d) => [d._id, d]),
  );
  const entries: DayEntry[] = days.map((day) => {
    const prev = existing.get(day);
    return {
      day,
      inc: inc.get(day) ?? {},
      prev: prev
        ? {
            ...(prev.subscribers !== undefined ? { subscribers: prev.subscribers } : {}),
            ...(prev.subscribersVersion !== undefined
              ? { subscribersVersion: prev.subscribersVersion }
              : {}),
          }
        : null,
      ...(day < today ? { snapshot: totals.get(day) } : {}),
    };
  });
  await demo.insertOne({
    _id: MANIFEST_ID,
    createdAt: now,
    counterDelta: demoTotal,
    days: entries,
  });

  if (subscriberDocs.length) await db.collection("subscribers").insertMany(subscriberDocs);
  if (letters.length) await db.collection("letters").insertMany(letters);
  if (events.length) await db.collection("email_events").insertMany(events);
  await c.daily.bulkWrite(
    entries.map((e) => ({
      updateOne: {
        filter: { _id: e.day },
        update: {
          ...(Object.keys(e.inc).length ? { $inc: e.inc } : {}),
          ...(e.snapshot !== undefined
            ? {
                $set: {
                  subscribers: e.snapshot,
                  subscribersVersion: e.prev?.subscribersVersion ?? 0,
                },
              }
            : {}),
        },
        upsert: true,
      },
    })),
  );
  // Today's total goes through the live counter, so it matches the count everywhere.
  const res = await c.counters.findOneAndUpdate(
    { _id: "subscribers" },
    { $inc: { value: demoTotal, version: 1 } },
    { upsert: true, returnDocument: "after" },
  );
  await c.daily.updateOne(
    { _id: today },
    { $set: { subscribers: res?.value ?? 0, subscribersVersion: res?.version ?? 0 } },
    { upsert: true },
  );

  console.log(
    `Added ${subscriberDocs.length} subscribers, ${letters.length} published letters and ${events.length} clicks over ${DAYS} days.`,
  );
}

// ── Clear ───────────────────────────────────────────────────────────────────

async function clearDemo(): Promise<boolean> {
  const db = await getDb();
  const c = await collections();
  const demo = db.collection<Manifest>("demo_seed");
  const manifest = await demo.findOne({ _id: MANIFEST_ID });
  if (!manifest) return false;

  const today = dayKey();
  const ops = manifest.days.flatMap((e) => {
    const neg = Object.fromEntries(Object.entries(e.inc).map(([k, v]) => [k, -(v ?? 0)]));
    const restore =
      e.snapshot === undefined
        ? {}
        : e.prev?.subscribers !== undefined
          ? {
              $set: {
                subscribers: e.prev.subscribers,
                subscribersVersion: e.prev.subscribersVersion ?? 0,
              },
            }
          : { $unset: { subscribers: "" as const, subscribersVersion: "" as const } };
    const update = { ...(Object.keys(neg).length ? { $inc: neg } : {}), ...restore };
    return Object.keys(update).length ? [{ updateOne: { filter: { _id: e.day }, update } }] : [];
  });
  if (ops.length) await c.daily.bulkWrite(ops);
  // Days the seed created and that now hold nothing but zeros.
  const created = manifest.days.filter((e) => e.prev === null && e.day !== today).map((e) => e.day);
  if (created.length) {
    await c.daily.deleteMany({
      _id: { $in: created },
      subscribers: { $exists: false },
      $nor: (
        [
          "subscribersAdded",
          "subscribersRemoved",
          "delivered",
          "opens",
          "uniqueOpens",
          "clicks",
          "uniqueClicks",
        ] as const
      ).map((k) => ({ [k]: { $gt: 0 } })),
    });
  }

  const [subs, letters, events] = await Promise.all([
    db.collection("subscribers").deleteMany({ demo: true }),
    db.collection("letters").deleteMany({ demo: true }),
    db.collection("email_events").deleteMany({ demo: true }),
  ]);
  const res = await c.counters.findOneAndUpdate(
    { _id: "subscribers" },
    { $inc: { value: -manifest.counterDelta, version: 1 } },
    { returnDocument: "after" },
  );
  if (res) {
    await c.daily.updateOne(
      { _id: today },
      { $set: { subscribers: Math.max(0, res.value), subscribersVersion: res.version } },
      { upsert: true },
    );
  }
  await demo.deleteOne({ _id: MANIFEST_ID });
  console.log(
    `Removed ${subs.deletedCount} subscribers, ${letters.deletedCount} letters and ${events.deletedCount} clicks.`,
  );
  return true;
}

// ── CLI ─────────────────────────────────────────────────────────────────────

const args = new Set(process.argv.slice(2));
try {
  if (args.has("--clear") || args.has("--reset")) {
    if (!(await clearDemo())) console.log("No demo history to remove.");
  }
  if (!args.has("--clear")) await seedDemo();
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
} finally {
  await closeDb();
}
