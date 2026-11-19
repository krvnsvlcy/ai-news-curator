import { randomUUID } from "node:crypto";
import { ObjectId } from "mongodb";
import { collections } from "./client.js";
import {
  type LetterContent,
  type LetterContentInput,
  type LetterDoc,
  type LetterSendRecord,
  type LetterStatus,
  type LetterStoryDoc,
  letterContentSchema,
  readinessProblems,
} from "./letter-schema.js";

export class LetterNotFoundError extends Error {
  constructor() {
    super("This letter no longer exists.");
  }
}
export class LetterLockedError extends Error {
  constructor() {
    super("Published letters can't be edited. Duplicate it to make a new edition.");
  }
}
export class LetterConflictError extends Error {
  constructor() {
    super("This letter was changed somewhere else. Reload to get the latest version.");
  }
}
export class LetterNotReadyError extends Error {
  constructor(public problems: string[]) {
    super(`Not ready yet: ${problems.join(" ")}`);
  }
}
export class InvalidTransitionError extends Error {}

function toObjectId(id: string | ObjectId): ObjectId | null {
  if (id instanceof ObjectId) return id;
  return /^[0-9a-f]{24}$/.test(id) ? new ObjectId(id) : null;
}

function toStoryDocs(stories: LetterContent["stories"]): LetterStoryDoc[] {
  return stories.map((s) => ({
    id: s.id,
    articleId: s.articleId ? new ObjectId(s.articleId) : null,
    headline: s.headline,
    description: s.description,
    original: {
      title: s.original.title,
      url: s.original.url,
      sourceName: s.original.sourceName,
      ...(s.original.publishedAt ? { publishedAt: new Date(s.original.publishedAt) } : {}),
      ...(s.original.summary ? { summary: s.original.summary } : {}),
    },
  }));
}

/** Today's date in the newsroom's time zone, as YYYY-MM-DD. */
export function todayInLondon(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London" }).format(now);
}

export type LetterSort = "date-desc" | "date-asc" | "updated-desc";

export interface LetterSummary {
  _id: ObjectId;
  status: LetterStatus;
  headline: string;
  date: string;
  storyCount: number;
  updatedAt: Date;
  publishedAt?: Date;
}

export async function listLetters({
  status,
  sort = "date-desc",
  limit = 200,
}: {
  status?: LetterStatus;
  sort?: LetterSort;
  limit?: number;
} = {}): Promise<LetterSummary[]> {
  const { letters } = await collections();
  const order: Record<LetterSort, Record<string, 1 | -1>> = {
    "date-desc": { date: -1, updatedAt: -1 },
    "date-asc": { date: 1, updatedAt: 1 },
    "updated-desc": { updatedAt: -1 },
  };
  return letters
    .find(status ? { status } : {})
    .project<LetterSummary>({
      status: 1,
      headline: 1,
      date: 1,
      updatedAt: 1,
      publishedAt: 1,
      storyCount: { $size: "$stories" },
    })
    .sort(order[sort])
    .limit(limit)
    .toArray();
}

export async function countLettersByStatus(): Promise<Record<LetterStatus, number>> {
  const { letters } = await collections();
  const rows = await letters
    .aggregate<{ _id: LetterStatus; n: number }>([{ $group: { _id: "$status", n: { $sum: 1 } } }])
    .toArray();
  const counts: Record<LetterStatus, number> = { draft: 0, ready: 0, published: 0 };
  for (const r of rows) counts[r._id] = r.n;
  return counts;
}

export async function getLetter(id: string | ObjectId): Promise<LetterDoc | null> {
  const _id = toObjectId(id);
  if (!_id) return null;
  const { letters } = await collections();
  return letters.findOne({ _id });
}

export async function createLetter(date = todayInLondon()): Promise<LetterDoc> {
  const now = new Date();
  const doc: LetterDoc = {
    _id: new ObjectId(),
    status: "draft",
    headline: "",
    date: letterContentSchema.shape.date.parse(date),
    briefing: "",
    tone: "",
    stories: [],
    revision: 0,
    createdAt: now,
    updatedAt: now,
  };
  const { letters } = await collections();
  await letters.insertOne(doc);
  return doc;
}

export interface SaveResult {
  letter: LetterDoc;
  /** Set when a "ready" letter was moved back to draft because the edit left it incomplete. */
  demotedBecause?: string[];
}

/**
 * Replaces a letter's editorial content. Fails if the letter is published or if
 * `expectedRevision` is stale (someone else saved in the meantime).
 */
export async function saveLetterContent(
  id: string | ObjectId,
  expectedRevision: number,
  input: LetterContentInput,
): Promise<SaveResult> {
  const _id = toObjectId(id);
  if (!_id) throw new LetterNotFoundError();
  const content = letterContentSchema.parse(input);
  const { letters } = await collections();

  const current = await letters.findOne({ _id }, { projection: { status: 1, revision: 1 } });
  if (!current) throw new LetterNotFoundError();
  if (current.status === "published") throw new LetterLockedError();
  if (current.revision !== expectedRevision) throw new LetterConflictError();

  // An approved letter that no longer meets the bar goes back to draft.
  const problems = current.status === "ready" ? readinessProblems(content) : [];
  const status: LetterStatus = problems.length > 0 ? "draft" : current.status;

  const updated = await letters.findOneAndUpdate(
    { _id, revision: expectedRevision, status: { $ne: "published" } },
    {
      $set: {
        headline: content.headline,
        date: content.date,
        briefing: content.briefing,
        tone: content.tone,
        stories: toStoryDocs(content.stories),
        status,
        updatedAt: new Date(),
      },
      $inc: { revision: 1 },
      ...(status === "draft" && current.status === "ready" ? { $unset: { readyAt: "" } } : {}),
    },
    { returnDocument: "after" },
  );
  if (!updated) throw new LetterConflictError(); // lost a race between the read and the write
  return { letter: updated, ...(problems.length ? { demotedBecause: problems } : {}) };
}

const TRANSITIONS: Record<LetterStatus, LetterStatus[]> = {
  draft: ["ready"],
  ready: ["draft", "published"],
  published: [],
};

/**
 * Moves a letter through draft → ready → published. Publishing requires the
 * rendered HTML so the edition can be reproduced exactly later.
 */
export async function changeLetterStatus(
  id: string | ObjectId,
  expectedRevision: number,
  to: LetterStatus,
  options: { publishedHtml?: string } = {},
): Promise<LetterDoc> {
  const _id = toObjectId(id);
  if (!_id) throw new LetterNotFoundError();
  const { letters } = await collections();
  const letter = await letters.findOne({ _id });
  if (!letter) throw new LetterNotFoundError();
  if (letter.revision !== expectedRevision) throw new LetterConflictError();
  if (!TRANSITIONS[letter.status].includes(to)) {
    throw new InvalidTransitionError(`A ${letter.status} letter can't be marked ${to}.`);
  }
  if (to !== "draft") {
    const problems = readinessProblems(letter);
    if (problems.length) throw new LetterNotReadyError(problems);
  }
  if (to === "published" && !options.publishedHtml) {
    throw new Error("publishedHtml is required to publish a letter.");
  }

  const now = new Date();
  const $set: Partial<LetterDoc> = { status: to, updatedAt: now };
  if (to === "ready") $set.readyAt = now;
  if (to === "published") {
    $set.publishedAt = now;
    $set.publishedHtml = options.publishedHtml;
  }
  const updated = await letters.findOneAndUpdate(
    { _id, revision: expectedRevision, status: letter.status },
    {
      $set,
      $inc: { revision: 1 },
      ...(to === "draft" ? { $unset: { readyAt: "" } } : {}),
    },
    { returnDocument: "after" },
  );
  if (!updated) throw new LetterConflictError();
  return updated;
}

/** Copies a letter's content into a new draft dated today. Stories get new ids. */
export async function duplicateLetter(id: string | ObjectId): Promise<LetterDoc> {
  const source = await getLetter(id);
  if (!source) throw new LetterNotFoundError();
  const now = new Date();
  const doc: LetterDoc = {
    _id: new ObjectId(),
    status: "draft",
    headline: source.headline,
    date: todayInLondon(now),
    briefing: source.briefing,
    tone: source.tone,
    stories: source.stories.map((s) => ({ ...s, id: randomUUID() })),
    revision: 0,
    createdAt: now,
    updatedAt: now,
    duplicatedFrom: source._id,
  };
  // (sends are intentionally not copied: a duplicate hasn't been delivered)
  const { letters } = await collections();
  await letters.insertOne(doc);
  return doc;
}

/** Deletes a draft. Ready and published letters are kept. Returns whether it was deleted. */
export async function deleteDraftLetter(id: string | ObjectId): Promise<boolean> {
  const _id = toObjectId(id);
  if (!_id) return false;
  const { letters } = await collections();
  const res = await letters.deleteOne({ _id, status: "draft" });
  return res.deletedCount === 1;
}

/** Appends to the letter's delivery history. Doesn't touch content or revision. */
export async function recordLetterSend(
  id: string | ObjectId,
  entry: LetterSendRecord,
): Promise<void> {
  const _id = toObjectId(id);
  if (!_id) throw new LetterNotFoundError();
  const { letters } = await collections();
  await letters.updateOne({ _id }, { $push: { sends: { $each: [entry], $slice: -100 } } });
}
