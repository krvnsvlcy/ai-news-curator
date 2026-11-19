import { MongoServerError, ObjectId } from "mongodb";
import { collections } from "./client.js";
import { type FetchStatus, type SourceDoc, type SourceInput, sourceInputSchema } from "./schema.js";

export class DuplicateSlugError extends Error {
  constructor(slug: string) {
    super(`A source with slug "${slug}" already exists.`);
  }
}

function toObjectId(id: string | ObjectId): ObjectId | null {
  if (id instanceof ObjectId) return id;
  return ObjectId.isValid(id) && id.length === 24 ? new ObjectId(id) : null;
}

function isDuplicateKey(err: unknown): boolean {
  return err instanceof MongoServerError && err.code === 11000;
}

export async function listSources(): Promise<SourceDoc[]> {
  const { sources } = await collections();
  return sources.find().sort({ name: 1 }).toArray();
}

export async function getSource(id: string | ObjectId): Promise<SourceDoc | null> {
  const _id = toObjectId(id);
  if (!_id) return null;
  const { sources } = await collections();
  return sources.findOne({ _id });
}

export async function createSource(input: SourceInput): Promise<SourceDoc> {
  const data = sourceInputSchema.parse(input);
  const now = new Date();
  const doc: SourceDoc = { _id: new ObjectId(), ...data, createdAt: now, updatedAt: now };
  const { sources } = await collections();
  try {
    await sources.insertOne(doc);
  } catch (err) {
    if (isDuplicateKey(err)) throw new DuplicateSlugError(data.slug);
    throw err;
  }
  return doc;
}

export async function updateSource(
  id: string | ObjectId,
  input: SourceInput,
): Promise<SourceDoc | null> {
  const _id = toObjectId(id);
  if (!_id) return null;
  const data = sourceInputSchema.parse(input);
  const { sources, articles } = await collections();
  let updated: SourceDoc | null;
  try {
    updated = await sources.findOneAndUpdate(
      { _id },
      { $set: { ...data, updatedAt: new Date() } },
      { returnDocument: "after" },
    );
  } catch (err) {
    if (isDuplicateKey(err)) throw new DuplicateSlugError(data.slug);
    throw err;
  }
  if (updated) {
    // Keep denormalized fields on stored articles in sync.
    await articles.updateMany(
      { sourceId: _id },
      { $set: { sourceSlug: updated.slug, sourceName: updated.name } },
    );
  }
  return updated;
}

export async function setSourceEnabled(id: string | ObjectId, enabled: boolean): Promise<void> {
  const _id = toObjectId(id);
  if (!_id) return;
  const { sources } = await collections();
  await sources.updateOne({ _id }, { $set: { enabled, updatedAt: new Date() } });
}

/** Deletes a source and every article fetched from it. */
export async function deleteSource(id: string | ObjectId): Promise<void> {
  const _id = toObjectId(id);
  if (!_id) return;
  const { sources, articles } = await collections();
  await articles.deleteMany({ sourceId: _id });
  await sources.deleteOne({ _id });
}

export async function recordFetchResult(
  id: ObjectId,
  result:
    | { status: Extract<FetchStatus, "ok">; itemCount: number; newCount: number }
    | { status: Extract<FetchStatus, "error">; error: string },
  at = new Date(),
): Promise<void> {
  const { sources } = await collections();
  const $set: Partial<SourceDoc> =
    result.status === "ok"
      ? { lastStatus: "ok", lastItemCount: result.itemCount, lastNewCount: result.newCount }
      : { lastStatus: "error", lastError: result.error.slice(0, 1000) };
  await sources.updateOne(
    { _id: id },
    {
      $set: { ...$set, lastFetchedAt: at },
      ...(result.status === "ok" ? { $unset: { lastError: "" } } : {}),
    },
  );
}

/** Enabled sources never fetched, or whose fetch interval has elapsed. */
export async function listDueSources(now = new Date()): Promise<SourceDoc[]> {
  const { sources } = await collections();
  return sources
    .find({
      enabled: true,
      $or: [
        { lastFetchedAt: { $exists: false } },
        {
          $expr: {
            $lte: [
              { $add: ["$lastFetchedAt", { $multiply: ["$fetchIntervalMinutes", 60_000] }] },
              now,
            ],
          },
        },
      ],
    })
    .toArray();
}
