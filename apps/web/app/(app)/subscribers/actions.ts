"use server";

import {
  type AddSubscriberOutcome,
  addSubscriber,
  clearOwnSubscribers,
  importSubscribers,
  removeOwnSubscriber,
} from "@curator/db";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireSession } from "@/lib/auth/session";
import { ensureOwnerId } from "@/lib/owner-server";
import { isValidEmail, normalizeEmail, splitEmailList } from "@/lib/subscribers";

// Every action is scoped to this browser's owner id: you can only see and change
// the subscribers on your list. Adding an address that already exists links it
// to your list. The layout shows the all-owner total, so refresh it.
function refresh() {
  revalidatePath("/", "layout");
}

const MAX_BULK = 500;

export async function addSubscriberAction(
  rawEmail: string,
): Promise<AddSubscriberOutcome | "invalid"> {
  await requireSession();
  const email = normalizeEmail(String(rawEmail));
  if (!isValidEmail(email)) return "invalid";
  const ownerId = await ensureOwnerId();
  const outcome = await addSubscriber({ email, ownerId });
  refresh();
  return outcome;
}

export async function addManySubscribersAction(text: string): Promise<{
  added: number;
  skipped: number;
  invalid: string[];
  tooMany?: boolean;
}> {
  await requireSession();
  const tokens = splitEmailList(String(text));
  if (tokens.length > MAX_BULK) return { added: 0, skipped: 0, invalid: [], tooMany: true };
  const ownerId = await ensureOwnerId();
  const result = { added: 0, skipped: 0, invalid: [] as string[] };
  for (const t of tokens) {
    const email = normalizeEmail(t);
    if (!isValidEmail(email)) {
      result.invalid.push(t);
      continue;
    }
    const outcome = await addSubscriber({ email, ownerId });
    if (outcome === "exists") result.skipped++;
    else result.added++;
  }
  refresh();
  return result;
}

export async function removeSubscriberAction(id: string): Promise<boolean> {
  await requireSession();
  const ok = await removeOwnSubscriber(await ensureOwnerId(), String(id));
  refresh();
  return ok;
}

export async function clearSubscribersAction(): Promise<number> {
  await requireSession();
  const n = await clearOwnSubscribers(await ensureOwnerId());
  refresh();
  return n;
}

const legacySchema = z
  .array(
    z.object({
      email: z.string().max(254),
      status: z.enum(["active", "unsubscribed"]),
      subscribedAt: z.iso.datetime(),
    }),
  )
  .max(MAX_BULK);

/**
 * Moves this browser's old localStorage list into the database (once). Addresses
 * that had unsubscribed are left out: there's no opting out any more.
 */
export async function importLegacySubscribersAction(
  rows: unknown,
): Promise<{ ok: true; moved: number } | { ok: false }> {
  await requireSession();
  const parsed = legacySchema.safeParse(rows);
  if (!parsed.success) return { ok: false };
  const valid = parsed.data.filter(
    (r) => r.status === "active" && isValidEmail(normalizeEmail(r.email)),
  );
  const res = await importSubscribers(
    await ensureOwnerId(),
    valid.map((r) => ({
      email: r.email,
      subscribedAt: new Date(r.subscribedAt),
    })),
  );
  refresh();
  return { ok: true, moved: res.imported + res.linked };
}
