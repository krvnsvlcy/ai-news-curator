import { MongoServerError, ObjectId } from "mongodb";
import { collections } from "./client.js";
import { recordSubscriberChange } from "./stats.js";

// Subscribers are managed by the editors only (no reader signup or unsubscribe).
// One shared row per address (lowercased). Each row lists the owners that
// reference it: opaque ids the web app keeps per browser in a cookie. Adding an
// address that already exists just adds your reference; removing drops only
// yours, and the row goes with the last one. Everyone sees the total count;
// only referencing owners see details. Every address on your list gets your sends.

export interface SubscriberDoc {
  _id: ObjectId;
  /** Trimmed and lowercased; unique across the collection. */
  email: string;
  /** Owners whose list includes this address. The row is deleted when empty. */
  ownerIds: string[];
  /** When the address was first added. */
  subscribedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * - added: a new address.
 * - linked: the address already existed; it's now on your list too.
 * - exists: already on your list.
 */
export type AddSubscriberOutcome = "added" | "linked" | "exists";

export function normalizeSubscriberEmail(email: string): string {
  return email.trim().toLowerCase();
}

function toObjectId(id: string): ObjectId | null {
  return ObjectId.isValid(id) && id.length === 24 ? new ObjectId(id) : null;
}

function isDuplicateKey(err: unknown): boolean {
  return err instanceof MongoServerError && err.code === 11000;
}

/** Total across every owner. A count only, never addresses. */
export async function countSubscribers(): Promise<number> {
  const { subscribers } = await collections();
  return subscribers.countDocuments();
}

export async function listOwnSubscribers(ownerId: string): Promise<SubscriberDoc[]> {
  const { subscribers } = await collections();
  return subscribers.find({ ownerIds: ownerId }).sort({ subscribedAt: -1, _id: -1 }).toArray();
}

export async function listOwnEmails(ownerId: string, limit: number): Promise<string[]> {
  const { subscribers } = await collections();
  const rows = await subscribers
    .find({ ownerIds: ownerId }, { projection: { email: 1 } })
    .sort({ subscribedAt: 1, _id: 1 })
    .limit(limit)
    .toArray();
  return rows.map((r) => r.email);
}

export async function countOwnSubscribers(ownerId: string): Promise<number> {
  const { subscribers } = await collections();
  return subscribers.countDocuments({ ownerIds: ownerId });
}

/** Adds an address to `ownerId`'s list. An existing address is linked, not duplicated. */
export async function addSubscriber(input: {
  email: string;
  ownerId: string;
}): Promise<AddSubscriberOutcome> {
  const email = normalizeSubscriberEmail(input.email);
  const { subscribers } = await collections();

  for (let attempt = 0; attempt < 2; attempt++) {
    const existing = await subscribers.findOne({ email });
    if (!existing) {
      const now = new Date();
      try {
        await subscribers.insertOne({
          _id: new ObjectId(),
          email,
          ownerIds: [input.ownerId],
          subscribedAt: now,
          createdAt: now,
          updatedAt: now,
        });
        await recordSubscriberChange(1);
        return "added";
      } catch (err) {
        if (isDuplicateKey(err)) continue; // added concurrently: re-read and link it
        throw err;
      }
    }

    if ((existing.ownerIds ?? []).includes(input.ownerId)) return "exists";
    const res = await subscribers.updateOne(
      { _id: existing._id },
      {
        $addToSet: { ownerIds: input.ownerId },
        $set: { updatedAt: new Date() },
      },
    );
    if (res.matchedCount === 0) continue; // deleted meanwhile (last reference removed): retry
    return "linked";
  }
  return "exists";
}

/** Removes the address from your list; the row goes once no list references it. */
export async function removeOwnSubscriber(ownerId: string, id: string): Promise<boolean> {
  const _id = toObjectId(id);
  if (!_id) return false;
  const { subscribers } = await collections();
  const res = await subscribers.updateOne(
    { _id, ownerIds: ownerId },
    { $pull: { ownerIds: ownerId }, $set: { updatedAt: new Date() } },
  );
  const del = await subscribers.deleteOne({ _id, ownerIds: { $size: 0 } });
  await recordSubscriberChange(-del.deletedCount);
  return res.matchedCount === 1;
}

/** Empties your list. Returns how many addresses were on it. */
export async function clearOwnSubscribers(ownerId: string): Promise<number> {
  const { subscribers } = await collections();
  const res = await subscribers.updateMany(
    { ownerIds: ownerId },
    { $pull: { ownerIds: ownerId }, $set: { updatedAt: new Date() } },
  );
  const del = await subscribers.deleteMany({ ownerIds: { $size: 0 } });
  await recordSubscriberChange(-del.deletedCount);
  return res.matchedCount;
}

/**
 * One-time move of a browser's old localStorage list into the database. New
 * addresses keep their old date; existing ones are linked to your list.
 */
export async function importSubscribers(
  ownerId: string,
  rows: { email: string; subscribedAt: Date }[],
): Promise<{ imported: number; linked: number }> {
  const { subscribers } = await collections();
  const result = { imported: 0, linked: 0 };
  const seen = new Set<string>();
  for (const r of rows) {
    const email = normalizeSubscriberEmail(r.email);
    if (seen.has(email)) continue;
    seen.add(email);
    const now = new Date();
    const res = await subscribers.updateOne(
      { email },
      {
        $addToSet: { ownerIds: ownerId },
        $set: { updatedAt: now },
        $setOnInsert: { subscribedAt: r.subscribedAt, createdAt: now },
      },
      { upsert: true },
    );
    if (res.upsertedCount) result.imported++;
    else if (res.modifiedCount) result.linked++;
  }
  await recordSubscriberChange(result.imported);
  return result;
}
